-- 自分との約束（毎日の習慣の代わり）：チャットのClaudeが読む表と、頼まれたときにチェックする関数
-- days の promises[id] = 'min'（最低ライン）|'full'（ふつう）、promises[id||'At'] = 守れた時刻（ミリ秒）
-- 約束の中身は settings/main の promises（なければ最初の3つ）
create or replace function readable.default_promises() returns jsonb language sql immutable set search_path = pg_catalog as $$
  select '[{"id":"p1","title":"服を着替える","full":"起きたら着替える","min":"上だけでも替える"},{"id":"p2","title":"外に出る","full":"いつものコースを歩く（気になったら写真1枚）","min":"玄関の外で空を見る"},{"id":"p3","title":"アニメを1話ちゃんと見る","full":"スマホを置いて最後まで","min":"半分まででもOK"}]'::jsonb
$$;
create or replace view readable.promises as
select d.id::date as day,
       p.ord::int as no,
       p.value->>'title' as promise,
       case d.data->'promises'->>(p.value->>'id') when 'full' then 'ふつう' when 'min' then '最低ライン' else 'まだ' end as kept,
       to_char(readable.jst((d.data->'promises'->>((p.value->>'id') || 'At'))::bigint), 'HH24:MI') as kept_at,
       p.value->>'full' as normal_line,
       p.value->>'min' as minimum_line
  from docs d
  left join docs s on s.collection = 'settings' and s.id = 'main' and s.user_id = d.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.data->'promises') = 'array' then s.data->'promises' else readable.default_promises() end) with ordinality p(value, ord)
 where d.collection = 'days' and (d.data ? 'promises' or d.id >= '2026-11-25')
 order by d.id::date, p.ord;
revoke all on readable.promises from public, anon, authenticated;
revoke all on function readable.default_promises() from public, anon, authenticated;

-- 約束をチェックする：p_promise は約束の名前の一部か id、p_level は 'min'（最低ライン）/'full'（ふつう）/'none'（戻す）
create or replace function ops.check_promise(p_promise text, p_level text default 'full', p_day text default null)
returns jsonb language plpgsql
set search_path = public, ops, readable, extensions, pg_temp as $$
declare d text := coalesce(p_day, ops.logical_day()); doc jsonb := ops.day_doc(d);
  st jsonb; list jsonb; hit jsonb; pid text; pr jsonb; prev text;
begin
  if p_level not in ('min', 'full', 'none') then raise exception 'p_level は min（最低ライン）・full（ふつう）・none（戻す）'; end if;
  st := ops.get('settings', 'main');
  list := case when jsonb_typeof(st->'promises') = 'array' then st->'promises' else readable.default_promises() end;
  select v into hit from jsonb_array_elements(list) v where v->>'id' = p_promise or v->>'title' ilike '%' || p_promise || '%' limit 1;
  if hit is null then raise exception '約束「%」が見つからない（今の約束：%）', p_promise, (select string_agg(v->>'title', '・') from jsonb_array_elements(list) v); end if;
  pid := hit->>'id'; pr := coalesce(doc->'promises', '{}'::jsonb); prev := pr->>pid;
  if p_level = 'none' then pr := pr || jsonb_build_object(pid, null, pid || 'At', null);
  else pr := pr || jsonb_build_object(pid, p_level, pid || 'At', case when prev in ('min', 'full') then coalesce((pr->>(pid || 'At'))::bigint, ops.now_ms()) else ops.now_ms() end);
  end if;
  doc := jsonb_set(doc, '{promises}', pr);
  perform ops.put('days', d, doc);
  return jsonb_build_object('day', d, 'promise', hit->>'title', 'kept', p_level);
end $$;
revoke all on function ops.check_promise(text, text, text) from public, anon, authenticated;
