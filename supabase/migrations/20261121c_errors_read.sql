-- エラーの記録を、アプリの設定画面から読む・片付ける（api_daylog.call に errs / errclear を足す）
drop policy if exists "errors: api_daylog read" on public.client_errors;
drop policy if exists "errors: api_daylog clear" on public.client_errors;
drop policy if exists "errors: clear own" on public.client_errors;
create policy "errors: api_daylog read" on public.client_errors for select to daylog_api using (user_id = ops.me());
create policy "errors: api_daylog clear" on public.client_errors for delete to daylog_api using (user_id = ops.me());
create policy "errors: clear own" on public.client_errors for delete to authenticated using (user_id = (select auth.uid()));
-- 速さの警告：auth.uid() を1回だけ計算する形にする
drop policy if exists "errors: write own" on public.client_errors;
drop policy if exists "errors: read own" on public.client_errors;
create policy "errors: write own" on public.client_errors for insert to authenticated with check (user_id = (select auth.uid()));
create policy "errors: read own" on public.client_errors for select to authenticated using (user_id = (select auth.uid()));
-- 速さの警告：外部キーに索引をつける
create index if not exists device_tokens_user_id on public.device_tokens(user_id);
create index if not exists push_sent_user_id on public.push_sent(user_id);
create index if not exists push_subs_user_id on public.push_subs(user_id);
grant select, delete on table public.client_errors to daylog_api;
grant delete on table public.client_errors to authenticated;

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
