-- ホーム画面のDaylogから直接通知を出す（Web Push）
create table if not exists public.push_subs (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  last_ok timestamptz,
  fails int not null default 0
);
alter table public.push_subs enable row level security;
drop policy if exists "push_subs: own select" on public.push_subs;
drop policy if exists "push_subs: own insert" on public.push_subs;
drop policy if exists "push_subs: own update" on public.push_subs;
drop policy if exists "push_subs: own delete" on public.push_subs;
create policy "push_subs: own select" on public.push_subs for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subs: own insert" on public.push_subs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subs: own update" on public.push_subs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subs: own delete" on public.push_subs for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subs to authenticated;
grant usage on sequence public.push_subs_id_seq to authenticated;

-- 送った通知の控え（同じ通知を2回送らないため）。サーバーだけが使う
create table if not exists public.push_sent (
  key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.push_sent enable row level security;

-- 予定の読み込み結果を少しの間だけ覚えておく（毎分Googleに聞かないため）。サーバーだけが使う
create table if not exists public.push_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.push_cache enable row level security;

-- 毎分、通知の係（Edge Function: daylog-push）を呼ぶ。合言葉（x-cron-secret）は公開リポジトリには書かない
create extension if not exists pg_net;
create extension if not exists pg_cron;
-- select cron.schedule('daylog-push', '* * * * *', $$ select net.http_post(
--   url := 'https://etsuxjcrnyoevrasdhde.supabase.co/functions/v1/daylog-push',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<合言葉>'),
--   body := '{}'::jsonb, timeout_milliseconds := 20000) $$);

-- 通知の鍵（VAPID）と毎分の呼び出しの合言葉。サーバー（service_role）だけが読める。値は公開リポジトリに書かない
create table if not exists public.push_keys (key text primary key, value text not null);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;
