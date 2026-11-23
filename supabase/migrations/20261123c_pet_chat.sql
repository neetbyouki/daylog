-- ペットの部屋の会話（Claude API・Haiku 5.5）：claude.ai版は SQL しか使えないので、api_daylog.call の 'chat' から
-- daylog_private.chat_call（http で待って呼ぶ）→ Edge Function daylog-chat（合言葉 x-cron-secret 付き）へ
create or replace function daylog_private.chat_call(p_body jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sec text; r extensions.http_response;
begin
  select value into sec from public.push_keys where key = 'cron_secret';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '60000');
  r := extensions.http(('POST', 'https://etsuxjcrnyoevrasdhde.supabase.co/functions/v1/daylog-chat',
         array[extensions.http_header('x-cron-secret', sec)], 'application/json', p_body::text)::extensions.http_request);
  if r.status <> 200 then raise exception 'daylog_chat: failed (%): %', r.status, left(r.content, 200); end if;
  return r.content::jsonb;
end $$;
revoke all on function daylog_private.chat_call(jsonb) from public, anon, authenticated;
grant execute on function daylog_private.chat_call(jsonb) to daylog_api;

CREATE OR REPLACE FUNCTION api_daylog.call(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if c is null or c !~ '^[a-z]{1,24}$' or jsonb_typeof(p->'ids') <> 'array' or jsonb_array_length(p->'ids') > 20 then raise exception 'daylog_api: bad get'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('c', collection, 'id', id, 'data', data,
             'u', floor(extract(epoch from updated_at) * 1000)::bigint)), '[]'::jsonb)
      into res from public.docs
     where user_id = me and collection = c and id in (select jsonb_array_elements_text(p->'ids'));
    if c = 'blobs' then
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
    select jsonb_build_object('n', count(*), 'bytes', coalesce(sum((data->>'size')::bigint), 0)) into res
      from public.docs where user_id = me and collection = 'blobs';
  elsif a = 'chat' then
    -- ペットの部屋の会話：これまでの会話（20件まで）を渡して、返事をもらう
    if jsonb_typeof(p->'messages') <> 'array' or jsonb_array_length(p->'messages') > 30 or octet_length((p->'messages')::text) > 60000 then raise exception 'daylog_api: bad chat'; end if;
    res := daylog_private.chat_call(jsonb_build_object('uid', me, 'messages', p->'messages'));
  elsif a = 'patch' then
    if jsonb_typeof(p->'patch') <> 'object' then raise exception 'daylog_api: bad patch'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, public.docs_merge(null, p->'patch'))
    on conflict (user_id, collection, id) do update set data = public.docs_merge(public.docs.data, p->'patch')
    returning data into res;
  elsif a = 'set' then
    if jsonb_typeof(p->'data') <> 'object' then raise exception 'daylog_api: bad data'; end if;
    if c = 'blobs' then
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
    if jsonb_typeof(p->'rows') <> 'array' or jsonb_array_length(p->'rows') > 20 then raise exception 'daylog_api: bad err'; end if;
    insert into public.client_errors(user_id, seen_at, ver, src, view, kind, msg, stack, ua, n)
    select me, to_timestamp(least(greatest(coalesce((r->>'t')::bigint, 0), 0), 4102444800000) / 1000.0),
           left(r->>'ver', 40), left(r->>'src', 20), left(r->>'view', 40), left(r->>'kind', 40),
           left(coalesce(r->>'msg', '?'), 600), left(r->>'stack', 4000), left(r->>'ua', 300), least(greatest(coalesce((r->>'n')::int, 1), 1), 10000)
      from jsonb_array_elements(p->'rows') r;
    res := 'true'::jsonb;
  elsif a = 'errs' then
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
end $function$;
alter function api_daylog.call(jsonb) owner to daylog_api;
revoke all on function api_daylog.call(jsonb) from public;
grant execute on function api_daylog.call(jsonb) to postgres;
