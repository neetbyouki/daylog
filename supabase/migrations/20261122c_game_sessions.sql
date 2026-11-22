-- ゲームをした時間帯（いつ・どのくらい）：pc/<日付> に sessions を足す
-- ・ゲームごとに、10分以上あかずに続いた分を1つに（3分未満は捨てる）。{ g: プロセス名, from, to, min }
-- ・Edge Function daylog の pc_activity と同じ計算
-- ・チャットのClaudeが読む用に readable.game_sessions
CREATE OR REPLACE FUNCTION public.pc_summarize(p_uid uuid, p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  SLEEP_GAP constant bigint := 180 * 60000;
  NAP_GAP constant bigint := 60 * 60000;
  H constant bigint := 3600000;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  t0 bigint; t1 bigint;
  act bigint[]; gs_start bigint[] := '{}'; gs_end bigint[] := '{}'; gs_len bigint[] := '{}';
  i int; d date; ws bigint; we bigint; lim bigint;
  first_t bigint; last_t bigint; n_in int; act_n int; game_min int; games jsonb; naps jsonb; sess jsonb; doc jsonb; cur jsonb; written int := 0;
  ds text;
begin
  t0 := (extract(epoch from (((p_from - 1)::timestamp + interval '6 hours') at time zone 'Asia/Tokyo')) * 1000)::bigint;
  t1 := (extract(epoch from (((p_to + 2)::timestamp + interval '6 hours') at time zone 'Asia/Tokyo')) * 1000)::bigint;
  select coalesce(array_agg(t order by t), '{}') into act from public.pc_log
    where user_id = p_uid and t >= t0 and t < t1 and (idle < 300 or game is not null);
  for i in 2 .. coalesce(array_length(act, 1), 0) loop
    if act[i] - act[i-1] >= NAP_GAP then
      gs_start := gs_start || act[i-1]; gs_end := gs_end || act[i]; gs_len := gs_len || (act[i] - act[i-1]);
    end if;
  end loop;
  d := p_from;
  while d <= p_to loop
    ws := (extract(epoch from ((d::timestamp + interval '6 hours') at time zone 'Asia/Tokyo')) * 1000)::bigint;
    we := ws + 24 * H; lim := ws + 30 * H;
    select count(*) into n_in from public.pc_log where user_id = p_uid and t >= ws and t < we;
    if n_in > 0 then
      act_n := (select count(*) from unnest(act) a where a >= ws and a < we);
      first_t := null; last_t := null;
      for i in 1 .. coalesce(array_length(gs_len, 1), 0) loop
        if gs_len[i] >= SLEEP_GAP and gs_end[i] >= ws and gs_end[i] < we then first_t := gs_end[i]; exit; end if;
      end loop;
      for i in 1 .. coalesce(array_length(gs_len, 1), 0) loop
        if gs_len[i] >= SLEEP_GAP and gs_start[i] >= coalesce(first_t, ws) and gs_start[i] < lim then last_t := gs_start[i]; exit; end if;
      end loop;
      if last_t is null and we < now_ms - 6 * H then
        last_t := (select max(a) from unnest(act) a where a >= ws and a < lim);
      end if;
      select coalesce(sum(c), 0), coalesce(jsonb_object_agg(game, c), '{}'::jsonb) into game_min, games
        from (select game, count(*)::int c from public.pc_log where user_id = p_uid and t >= ws and t < we and game is not null group by game) g;
      naps := '[]'::jsonb;
      for i in 1 .. coalesce(array_length(gs_len, 1), 0) loop
        if gs_len[i] < SLEEP_GAP and gs_start[i] >= coalesce(first_t, ws) and gs_start[i] < coalesce(last_t, now_ms) and gs_start[i] >= ws and gs_start[i] < we then
          naps := naps || jsonb_build_array(jsonb_build_object('from', gs_start[i], 'to', gs_end[i]));
        end if;
      end loop;
      -- ゲームをした時間帯
      select coalesce(jsonb_agg(jsonb_build_object('g', game, 'from', s, 'to', e + 60000, 'min', n) order by s), '[]'::jsonb) into sess
        from (select game, min(t) s, max(t) e, count(*)::int n from (
                select game, t, sum(brk) over (partition by game order by t) grp from (
                  select game, t, case when t - lag(t) over (partition by game order by t) > 600000 then 1 else 0 end brk
                    from public.pc_log where user_id = p_uid and t >= ws and t < we and game is not null and left(game, 1) <> '~') a) b
              group by game, grp) c
       where n >= 3;
      ds := to_char(d, 'YYYY-MM-DD');
      doc := jsonb_build_object('date', ds, 'first', first_t, 'last', last_t, 'activeMinutes', act_n, 'gameMinutes', game_min, 'games', games, 'naps', naps, 'sessions', sess);
      select data into cur from public.docs where user_id = p_uid and collection = 'pc' and id = ds;
      if cur is distinct from doc then
        insert into public.docs(user_id, collection, id, data, updated_at) values (p_uid, 'pc', ds, doc, now())
        on conflict (user_id, collection, id) do update set data = excluded.data, updated_at = now();
        written := written + 1;
      end if;
    end if;
    d := d + 1;
  end loop;
  return written;
end $function$;

create or replace view readable.game_sessions as
select (d.id)::date as day,
       case when s->>'g' ~* '^valorant' then 'VALORANT' else s->>'g' end as game,
       to_char(readable.jst((s->>'from')::bigint), 'MM/DD HH24:MI') as started,
       to_char(readable.jst((s->>'to')::bigint), 'MM/DD HH24:MI') as ended,
       (s->>'min')::int as minutes
  from public.docs d, jsonb_array_elements(coalesce(d.data->'sessions', '[]'::jsonb)) s
 where d.collection = 'pc';
revoke all on readable.game_sessions from public, anon, authenticated;

-- これまで（見張り役の記録が残っている60日分）にも足す
select public.pc_summarize(u.user_id, ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date - 60, ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date)
  from (select distinct user_id from public.pc_log) u;
