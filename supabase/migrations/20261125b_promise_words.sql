-- 約束の文を短く（2026-11-25）：着替える（上だけ）／外に出る（すこし）／アニメ見る（半分）。（）は半分地点
create or replace function readable.default_promises() returns jsonb language sql immutable set search_path = pg_catalog as $$
  select '[{"id":"p1","title":"着替える","full":"着替える","min":"上だけ"},{"id":"p2","title":"外に出る","full":"外に出る","min":"すこし"},{"id":"p3","title":"アニメ見る","full":"アニメ見る","min":"半分"}]'::jsonb
$$;
drop view if exists readable.promises;
create view readable.promises as
select d.id::date as day,
       p.ord::int as no,
       p.value->>'title' as promise,
       p.value->>'min' as half_point,
       case d.data->'promises'->>(p.value->>'id') when 'full' then 'ふつう' when 'min' then '半分' else 'まだ' end as kept,
       to_char(readable.jst((d.data->'promises'->>((p.value->>'id') || 'At'))::bigint), 'HH24:MI') as kept_at
  from docs d
  left join docs s on s.collection = 'settings' and s.id = 'main' and s.user_id = d.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.data->'promises') = 'array' then s.data->'promises' else readable.default_promises() end) with ordinality p(value, ord)
 where d.collection = 'days' and (d.data ? 'promises' or d.id >= '2026-11-25')
 order by d.id::date, p.ord;
revoke all on readable.promises from public, anon, authenticated;
