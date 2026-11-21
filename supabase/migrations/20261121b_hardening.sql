-- 2026-11-21 守りを固める（Supabaseの警告を全部直す）＋エラーの自動報告＋毎週のバックアップ
-- ・PCの入口（pc_*）：中身を外から見えない場所（daylog_private）へ移し、合言葉に期限（使わないまま60日で切れる）と回数制限を付けた
-- ・関数の search_path を固定。サーバーだけが使う表には「誰も読めない」決まりを明記。pg_net を extensions へ
-- ・client_errors：画面で起きたエラーを貯める表（持ち主だけが書けて読める。1時間に200件まで、90日で消す）
-- ・毎週月曜4:30（日本時間）に Googleドライブへバックアップ。アプリの「今すぐ保存」は docs の meta/backupreq に書くと1分以内に動く

-- ── 1) PCの入口
create schema if not exists daylog_private;
revoke all on schema daylog_private from public;
grant usage on schema daylog_private to anon, authenticated;

alter table public.device_tokens
  add column if not exists expires_at timestamptz,
  add column if not exists rl_at timestamptz,
  add column if not exists rl_n int not null default 0,
  add column if not exists bk_day date,
  add column if not exists bk_n int not null default 0;
update public.device_tokens set expires_at = greatest(coalesce(last_seen, created_at), now()) + interval '60 days' where expires_at is null;

-- 合言葉を確かめる：期限（最後に使ってから60日）・回数（1時間に300回まで、まるごとの書き出しは1日6回まで）
create or replace function daylog_private.pc_auth(p_token text, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h text; r public.device_tokens%rowtype;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then raise exception 'bad token'; end if;
  h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into r from public.device_tokens where token_hash = h for update;
  if not found then raise exception 'bad token'; end if;
  if r.expires_at is not null and r.expires_at < now() then raise exception 'token expired'; end if;
  if r.rl_at is null or r.rl_at < now() - interval '1 hour' then r.rl_at := now(); r.rl_n := 0; end if;
  if r.rl_n >= 300 then raise exception 'rate limited'; end if;
  if p_kind = 'backup' then
    if r.bk_day is distinct from current_date then r.bk_day := current_date; r.bk_n := 0; end if;
    if r.bk_n >= 6 then raise exception 'rate limited'; end if;
    r.bk_n := r.bk_n + 1;
  end if;
  update public.device_tokens
     set rl_at = r.rl_at, rl_n = r.rl_n + 1, bk_day = r.bk_day, bk_n = r.bk_n, last_seen = now(), expires_at = now() + interval '60 days'
   where token_hash = h;
  return r.user_id;
end $$;
revoke all on function daylog_private.pc_auth(text, text) from public;

create or replace function daylog_private.pc_ingest(p_token text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid; n integer; today date;
begin
  uid := daylog_private.pc_auth(p_token, 'ingest');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'too many rows'; end if;
  insert into public.pc_log(user_id, t, idle, game)
    select uid, (r->>'t')::bigint, coalesce((r->>'idle')::int, 0), nullif(r->>'game', '-')
    from jsonb_array_elements(p_rows) r
  on conflict (user_id, t) do update set idle = excluded.idle, game = excluded.game;
  get diagnostics n = row_count;
  delete from public.pc_log where user_id = uid and t < (extract(epoch from now()) * 1000 - 60::bigint * 86400000)::bigint;
  today := ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date;
  perform public.pc_summarize(uid, today - 1, today);
  return n;
end $$;
create or replace function daylog_private.pc_config(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; cfg jsonb;
begin
  uid := daylog_private.pc_auth(p_token, 'config');
  select data into cfg from public.docs where user_id = uid and collection = 'pcconfig' and id = 'main';
  return coalesce(cfg, '{}'::jsonb);
end $$;
create or replace function daylog_private.pc_backup(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; res jsonb;
begin
  uid := daylog_private.pc_auth(p_token, 'backup');
  select jsonb_build_object('app', 'Daylog', 'exportedAt', now(), 'collections', coalesce(jsonb_object_agg(c.collection, c.docs), '{}'::jsonb))
    into res
    from (select collection, jsonb_object_agg(id, data) as docs from public.docs where user_id = uid and collection <> 'blobs' group by collection) c;
  return res;
end $$;
create or replace function daylog_private.create_device_token(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.device_tokens where user_id = auth.uid() and (expires_at is null or expires_at > now())) >= 5 then raise exception 'too many devices'; end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.device_tokens(token_hash, user_id, name, expires_at) values (encode(extensions.digest(tok, 'sha256'), 'hex'), auth.uid(), left(p_name, 60), now() + interval '60 days');
  return tok;
end $$;
revoke all on function daylog_private.pc_ingest(text, jsonb), daylog_private.pc_config(text), daylog_private.pc_backup(text), daylog_private.create_device_token(text) from public;
grant execute on function daylog_private.pc_ingest(text, jsonb), daylog_private.pc_config(text), daylog_private.pc_backup(text) to anon, authenticated;
grant execute on function daylog_private.create_device_token(text) to authenticated;

-- 外から呼ぶ名前（/rest/v1/rpc/pc_*）はそのまま。中身は持たず、呼んだ人の権限で上の関数を呼ぶだけ
create or replace function public.pc_ingest(p_token text, p_rows jsonb) returns integer language sql security invoker set search_path = '' as $$ select daylog_private.pc_ingest(p_token, p_rows) $$;
create or replace function public.pc_config(p_token text) returns jsonb language sql security invoker set search_path = '' as $$ select daylog_private.pc_config(p_token) $$;
create or replace function public.pc_backup(p_token text) returns jsonb language sql security invoker set search_path = '' as $$ select daylog_private.pc_backup(p_token) $$;
create or replace function public.create_device_token(p_name text) returns text language sql security invoker set search_path = '' as $$ select daylog_private.create_device_token(p_name) $$;
revoke all on function public.pc_ingest(text, jsonb), public.pc_config(text), public.pc_backup(text), public.create_device_token(text) from public;
grant execute on function public.pc_ingest(text, jsonb), public.pc_config(text), public.pc_backup(text) to anon, authenticated;
grant execute on function public.create_device_token(text) to authenticated;

-- ── 2) 関数の search_path を固定（Claudeのチャットが使う ops.* と、読みやすい表の readable.*）
do $$ declare r record; begin
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('ops', 'readable') and p.prokind = 'f' and p.proconfig is null loop
    execute format('alter function %s set search_path = public, ops, readable, extensions, pg_temp', r.f);
  end loop;
end $$;

-- ── 3) サーバーだけが使う表：だれも読み書きできない、と明記
do $$ declare t text; begin
  foreach t in array array['google_tokens', 'push_cache', 'push_keys', 'push_sent'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('drop policy if exists "server only" on public.%I', t);
    execute format('create policy "server only" on public.%I for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- ── 4) pg_net の引っ越しは 20261121d_pg_net.sql に分けた（2026-11-22 適用）

-- ── 5) エラーの自動報告
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  seen_at timestamptz, ver text, src text, view text, kind text,
  msg text not null, stack text, ua text, n int not null default 1,
  constraint client_errors_len check (length(msg) <= 600 and length(coalesce(stack, '')) <= 4000 and length(coalesce(ua, '')) <= 300
    and length(coalesce(ver, '')) <= 40 and length(coalesce(src, '')) <= 20 and length(coalesce(view, '')) <= 40 and length(coalesce(kind, '')) <= 40)
);
create index if not exists client_errors_user_at on public.client_errors(user_id, at desc);
alter table public.client_errors enable row level security;
drop policy if exists "errors: write own" on public.client_errors;
drop policy if exists "errors: read own" on public.client_errors;
drop policy if exists "errors: api_daylog" on public.client_errors;
create policy "errors: write own" on public.client_errors for insert to authenticated with check (user_id = auth.uid());
create policy "errors: read own" on public.client_errors for select to authenticated using (user_id = auth.uid());
create policy "errors: api_daylog" on public.client_errors for insert to daylog_api with check (user_id = ops.me());
revoke all on table public.client_errors from anon;
grant select, insert on table public.client_errors to authenticated;
grant insert on table public.client_errors to daylog_api;
-- 1時間に200件をこえたら黙って捨てる（こわれた画面が同じエラーを出し続けても、表があふれない）
create or replace function daylog_private.client_errors_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_errors where user_id = new.user_id and at > now() - interval '1 hour') >= 200 then return null; end if;
  return new;
end $$;
revoke all on function daylog_private.client_errors_guard() from public;
drop trigger if exists client_errors_guard on public.client_errors;
create trigger client_errors_guard before insert on public.client_errors for each row execute function daylog_private.client_errors_guard();

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

-- ── 6) 毎週のバックアップ（Edge Function daylog-backup を呼ぶ）
create or replace function daylog_private.call_fn(p_fn text, p_body jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare sec text;
begin
  select value into sec from public.push_keys where key = 'cron_secret';
  return net.http_post(url := 'https://etsuxjcrnyoevrasdhde.supabase.co/functions/v1/' || p_fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', sec), body := p_body, timeout_milliseconds := 60000);
end $$;
revoke all on function daylog_private.call_fn(text, jsonb) from public;
-- アプリで「今すぐ保存」が押されていたら（meta/backupreq の at が、前に済ませた reqAt より新しい）呼ぶ
create or replace function daylog_private.backup_tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.docs q left join public.docs b on b.user_id = q.user_id and b.collection = 'meta' and b.id = 'backup'
              where q.collection = 'meta' and q.id = 'backupreq'
                and coalesce((q.data->>'at')::bigint, 0) > coalesce((b.data->>'reqAt')::bigint, 0)
                and coalesce((b.data->>'busyAt')::bigint, 0) < (extract(epoch from now()) * 1000)::bigint - 120000) then
    perform daylog_private.call_fn('daylog-backup', '{"mode":"req"}'::jsonb);
  end if;
end $$;
revoke all on function daylog_private.backup_tick() from public;

select cron.unschedule(jobid) from cron.job where jobname in ('daylog-backup-weekly', 'daylog-backup-req', 'daylog-errors-clean');
select cron.schedule('daylog-backup-weekly', '30 19 * * 0', $c$ select daylog_private.call_fn('daylog-backup', '{"mode":"weekly"}'::jsonb) $c$);
select cron.schedule('daylog-backup-req', '* * * * *', $c$ select daylog_private.backup_tick() $c$);
select cron.schedule('daylog-errors-clean', '17 18 * * *', $c$ delete from public.client_errors where at < now() - interval '90 days' $c$);
