-- 持ち主だけ（2026-11-28）
-- ① 持ち主の id を、サーバーだけが読める push_keys に置く（値はここに書かず、いまいる1人から写す）
--    daylog-chat（ペットとの会話・夜の一言・育成の3問＝Claude API のお金を使うもの）は、この id 以外を断る
-- ② 新しいアカウントを作らせない：もうだれかがいれば、2人目の登録はデータベースが断る
insert into public.push_keys (key, value)
select 'owner_uid', id::text from auth.users order by created_at limit 1
on conflict (key) do nothing;

create or replace function daylog_private.block_new_users() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Daylog は持ち主だけが使える（新しい登録は止めている）' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function daylog_private.block_new_users() from public, anon, authenticated;

drop trigger if exists daylog_block_new_users on auth.users;
create trigger daylog_block_new_users before insert on auth.users
  for each row execute function daylog_private.block_new_users();
