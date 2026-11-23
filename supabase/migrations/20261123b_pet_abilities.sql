-- ペットの能力（ちから・かしこさ・ひかり）と棚のごはん（おにく・やさい・おやつ）を readable.pet に出す
drop view if exists readable.pet;
create view readable.pet as
select data->>'name' as name,
       data->'stats'->>'stage' as stage,
       data->'stats'->>'form' as form,
       (data->'stats'->>'xp')::int as xp,
       (data->'stats'->>'power')::int as chikara,
       (data->'stats'->>'wisdom')::int as kashikosa,
       (data->'stats'->>'light')::int as hikari,
       (data->'stats'->>'meat')::int as shelf_niku,
       (data->'stats'->>'veg')::int as shelf_yasai,
       (data->'stats'->>'snack')::int as shelf_oyatsu,
       (data->'stats'->>'bond')::int as bond,
       (data->'stats'->>'energy')::int as energy,
       data->>'bornDay' as born,
       data->'trip'->>'place' as last_trip,
       to_char(readable.jst((data->'stats'->>'at')::bigint), 'YYYY-MM-DD HH24:MI') as updated
  from docs where collection = 'pet' and id = 'main';
revoke all on readable.pet from public, anon, authenticated;
