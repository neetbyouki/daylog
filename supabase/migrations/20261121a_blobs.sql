-- 長いメモ（ノート）の画像は docs の collection = 'blobs' に1枚ずつ置く。
-- 画像は大きいので、最初の読み込み（load）・差分（since）・一覧（ids）には含めず、必要なときに get で取る
create or replace function api_daylog.call(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a text := p->>'a'; c text := p->>'c'; i text := p->>'id'; me uuid := ops.me(); res jsonb;
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
  elsif a = 'patch' then
    if jsonb_typeof(p->'patch') <> 'object' then raise exception 'daylog_api: bad patch'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, public.docs_merge(null, p->'patch'))
    on conflict (user_id, collection, id) do update set data = public.docs_merge(public.docs.data, p->'patch')
    returning data into res;
  elsif a = 'set' then
    if jsonb_typeof(p->'data') <> 'object' then raise exception 'daylog_api: bad data'; end if;
    if c = 'blobs' and octet_length((p->'data')::text) > 1500000 then raise exception 'daylog_api: bad data (too large)'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, p->'data')
    on conflict (user_id, collection, id) do update set data = excluded.data
    returning case when c = 'blobs' then 'true'::jsonb else data end into res;
  elsif a = 'del' then
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
