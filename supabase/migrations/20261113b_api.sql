-- claude.ai版の入口を「記録の読み書きだけ」に絞る
-- ・claude.ai版は、どんなときも `select api_daylog.call('<JSON>'::jsonb)` の形だけを送る
-- ・call は daylog_api という権限の小さい役割で動く。この役割にできるのは、持ち主の docs の行の読み書きだけ
--   （ほかの表・関数・設定には触れない。表を消すこともできない）

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'daylog_api') then
    create role daylog_api nologin noinherit;
  end if;
end $$;
grant daylog_api to postgres;

-- 持ち主（Daylogを使う本人）の id。daylog_api からも読めるよう、この関数だけは作った人の権限で動かす
create or replace function ops.me() returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = '8ka71music@gmail.com' limit 1
$$;

create schema if not exists api_daylog authorization daylog_api;
grant usage on schema public to daylog_api;
grant usage on schema ops to daylog_api;
revoke all on function ops.me() from public;
grant execute on function ops.me() to daylog_api, postgres;
grant select, insert, update, delete on public.docs to daylog_api;
drop policy if exists "docs: api_daylog owner" on public.docs;
create policy "docs: api_daylog owner" on public.docs for all to daylog_api
  using (user_id = ops.me()) with check (user_id = ops.me());

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
     where user_id = me and (a = 'load' or updated_at >= to_timestamp(coalesce((p->>'since')::bigint, 0) / 1000.0));
  elsif a = 'ids' then
    select coalesce(jsonb_agg(jsonb_build_object('c', collection, 'id', id)), '[]'::jsonb) into res from public.docs where user_id = me;
  elsif a = 'patch' then
    if jsonb_typeof(p->'patch') <> 'object' then raise exception 'daylog_api: bad patch'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, public.docs_merge(null, p->'patch'))
    on conflict (user_id, collection, id) do update set data = public.docs_merge(public.docs.data, p->'patch')
    returning data into res;
  elsif a = 'set' then
    if jsonb_typeof(p->'data') <> 'object' then raise exception 'daylog_api: bad data'; end if;
    insert into public.docs(user_id, collection, id, data) values (me, c, i, p->'data')
    on conflict (user_id, collection, id) do update set data = excluded.data
    returning data into res;
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
