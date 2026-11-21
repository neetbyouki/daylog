-- 設定の「画像の置き場所」：api_daylog.call に imgstat を足す
create or replace function api_daylog.call(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a text := p->>'a'; c text := p->>'c'; i text := p->>'id'; me uuid := ops.me(); res jsonb;
  isrc text; ipos int; imime text; ir jsonb; meta jsonb; paths jsonb; files jsonb;
begin
  if me is null then raise exception 'daylog_api: owner not found'; end if;
  if a in ('patch', 'set', 'del') and (c is null or c !~ '^[a-z]{1,24}$' or i is null or i !~ '^[A-Za-z0-9_.:-]{1,100}$') then
    raise exception 'daylog_api: bad key';
  end if;
  if a = 'load' or a = 'since' then
    select coalesce(jsonb_agg(jsonb_build_object('c', collection, 'id', id, 'data', data,
             'u', floor(extract(epoch from updated_at) * 1000)::bigint)), '[]'::jsonb)
      into res from public.docs
     where user_id = me and collection <> 'blobs'
       and (a = 'load' or updated_at >= to_timestamp(coalesce((p->>'since')::bigint, 0) / 1000.0));
  elsif a = 'ids' then
    select coalesce(jsonb_agg(jsonb_build_object('c', collection, 'id', id)), '[]'::jsonb) into res from public.docs where user_id = me and collection <> 'blobs';
  elsif a = 'get' then
    -- 決まった記録だけを取る（画像など）。1回に20件まで
    if c is null or c !~ '^[a-z]{1,24}$' or jsonb_typeof(p->'ids') <> 'array' or jsonb_array_length(p->'ids') > 20 then raise exception 'daylog_api: bad get'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('c', collection, 'id', id, 'data', data,
             'u', floor(extract(epoch from updated_at) * 1000)::bigint)), '[]'::jsonb)
      into res from public.docs
     where user_id = me and collection = c and id in (select jsonb_array_elements_text(p->'ids'));
    if c = 'blobs' then
      -- 画像の中身は Storage にある。場所（path）だけの行は、中身を取ってきて src に戻す
      select coalesce(jsonb_agg(x->'data'->>'path'), '[]'::jsonb) into paths
        from jsonb_array_elements(res) x where x->'data' ? 'path' and not x->'data' ? 'src';
      if jsonb_array_length(paths) > 0 then
        files := coalesce(daylog_private.img_call(jsonb_build_object('op', 'get', 'uid', me, 'paths', paths))->'files', '{}'::jsonb);
        select coalesce(jsonb_agg(case when files ? (x->'data'->>'path')
                 then jsonb_set(x, '{data,src}', to_jsonb('data:' || coalesce(x->'data'->>'mime', 'image/jpeg') || ';base64,' || (files->>(x->'data'->>'path'))))
                 else x end), '[]'::jsonb) into res
          from jsonb_array_elements(res) x;
      end if;
    end if;
  elsif a = 'imgstat' then
    -- 画像の置き場所の使用量（枚数と大きさの合計）
    select jsonb_build_object('n', count(*), 'bytes', coalesce(sum((data->>'size')::bigint), 0)) into res
      from public.docs where user_id = me and collection = 'blobs';
  elsif a = 'patch' then
    if jsonb_typeof(p->'patch') <> 'object' then raise exception 'daylog_api: bad patch'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, public.docs_merge(null, p->'patch'))
    on conflict (user_id, collection, id) do update set data = public.docs_merge(public.docs.data, p->'patch')
    returning data into res;
  elsif a = 'set' then
    if jsonb_typeof(p->'data') <> 'object' then raise exception 'daylog_api: bad data'; end if;
    if c = 'blobs' then
      -- 画像：中身は Storage へ、docs には大きさ・ノート・場所だけを残す
      if octet_length((p->'data')::text) > 1500000 then raise exception 'daylog_api: bad data (too large)'; end if;
      meta := p->'data'; isrc := meta->>'src';
      if isrc is not null then
        ipos := position(';base64,' in isrc);
        if left(isrc, 5) <> 'data:' or ipos = 0 then raise exception 'daylog_api: bad image'; end if;
        imime := substr(isrc, 6, ipos - 6);
        if imime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then raise exception 'daylog_api: bad image type'; end if;
        ir := daylog_private.img_call(jsonb_build_object('op', 'put', 'uid', me, 'id', i, 'mime', imime, 'b64', substr(isrc, ipos + 8)));
        meta := (meta - 'src') || jsonb_build_object('mime', imime, 'path', ir->>'path', 'size', (ir->>'size')::int);
      end if;
      insert into public.docs(user_id, collection, id, data) values (me, c, i, meta)
      on conflict (user_id, collection, id) do update set data = excluded.data;
      res := 'true'::jsonb;
    else
      insert into public.docs(user_id, collection, id, data) values (me, c, i, p->'data')
      on conflict (user_id, collection, id) do update set data = excluded.data
      returning data into res;
    end if;
  elsif a = 'err' then
    -- 画面で起きたエラーの報告（1回に20件まで。長さは表の決まりで切る）
    if jsonb_typeof(p->'rows') <> 'array' or jsonb_array_length(p->'rows') > 20 then raise exception 'daylog_api: bad err'; end if;
    insert into public.client_errors(user_id, seen_at, ver, src, view, kind, msg, stack, ua, n)
    select me, to_timestamp(least(greatest(coalesce((r->>'t')::bigint, 0), 0), 4102444800000) / 1000.0),
           left(r->>'ver', 40), left(r->>'src', 20), left(r->>'view', 40), left(r->>'kind', 40),
           left(coalesce(r->>'msg', '?'), 600), left(r->>'stack', 4000), left(r->>'ua', 300), least(greatest(coalesce((r->>'n')::int, 1), 1), 10000)
      from jsonb_array_elements(p->'rows') r;
    res := 'true'::jsonb;
  elsif a = 'errs' then
    -- 記録されたエラーを読む（新しい順に50件）
    select coalesce(jsonb_agg(x order by (x->>'at')::bigint desc), '[]'::jsonb) into res from (
      select jsonb_build_object('id', id, 'at', floor(extract(epoch from at) * 1000)::bigint, 'seen', floor(extract(epoch from seen_at) * 1000)::bigint,
             'ver', ver, 'src', src, 'view', view, 'kind', kind, 'msg', msg, 'stack', left(stack, 1200), 'n', n) x
        from public.client_errors where user_id = me order by at desc limit 50) t;
  elsif a = 'errclear' then
    delete from public.client_errors where user_id = me;
    res := 'true'::jsonb;
  elsif a = 'del' then
    if c = 'blobs' then
      select jsonb_agg(data->>'path') into paths from public.docs where user_id = me and collection = 'blobs' and id = i and data ? 'path';
      if paths is not null then perform daylog_private.img_call(jsonb_build_object('op', 'del', 'uid', me, 'paths', paths)); end if;
    end if;
    delete from public.docs where user_id = me and collection = c and id = i;
    res := 'true'::jsonb;
  else
    raise exception 'daylog_api: unknown action';
  end if;
  return res;
end $$;
alter function api_daylog.call(jsonb) owner to daylog_api;
revoke all on function api_daylog.call(jsonb) from public;
grant execute on function api_daylog.call(jsonb) to postgres;
