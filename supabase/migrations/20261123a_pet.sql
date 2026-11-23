-- ペット：チャットのClaudeが「ペットの手紙」を書く入口と、ペットの様子を読むための表
-- ・手紙は docs の collection 'petmail'（{ id, text, at, read, by }）。アプリのペットの部屋に出て、「読んだ」で read=true
-- ・ペットの様子は pet/main の stats（アプリが変わったときに控える）
create or replace function ops.pet_letter(p_text text) returns jsonb
language plpgsql set search_path to 'public', 'ops', 'readable', 'extensions', 'pg_temp' as $function$
declare id text := ops.uid(); m jsonb;
begin
  if p_text is null or length(btrim(p_text)) = 0 then raise exception 'pet_letter: empty'; end if;
  m := jsonb_build_object('id', id, 'text', left(p_text, 1200), 'at', ops.now_ms(), 'read', false, 'by', 'claude-chat');
  perform ops.put('petmail', id, m);
  return m;
end $function$;
revoke all on function ops.pet_letter(text) from public, anon, authenticated;

create or replace view readable.pet as
select data->>'name' as name,
       data->'stats'->>'stage' as stage,
       data->'stats'->>'form' as form,
       (data->'stats'->>'xp')::int as xp,
       (data->'stats'->>'bond')::int as bond,
       (data->'stats'->>'stars')::int as stars,
       (data->'stats'->>'energy')::int as energy,
       data->>'bornDay' as born,
       data->'trip'->>'place' as last_trip,
       to_char(readable.jst((data->'stats'->>'at')::bigint), 'YYYY-MM-DD HH24:MI') as updated
  from docs where collection = 'pet' and id = 'main';
create or replace view readable.pet_letters as
select to_char(readable.jst((data->>'at')::bigint), 'YYYY-MM-DD HH24:MI') as at, data->>'text' as text, coalesce((data->>'read')::boolean, false) as read
  from docs where collection = 'petmail' order by 1;
revoke all on readable.pet, readable.pet_letters from public, anon, authenticated;
