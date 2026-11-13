-- 同じ日の記録をスマホとPCでほぼ同時に書いても消えないように、サーバー側で足し合わせる

-- 記録（entries）の足し合わせ：idごとに新しい方（u か t が大きい方。同じなら後から来た方）を残し、
-- 消した印（entriesDel）のあるものは除く。時刻順に並べる
create or replace function public.docs_merge_entries(old_e jsonb, new_e jsonb, del jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with alle as (
    select e, 0 as src from jsonb_array_elements(case when jsonb_typeof(old_e) = 'array' then old_e else '[]'::jsonb end) e
    union all
    select e, 1 from jsonb_array_elements(case when jsonb_typeof(new_e) = 'array' then new_e else '[]'::jsonb end) e
  ), ranked as (
    select e, row_number() over (partition by e->>'id'
      order by coalesce((e->>'u')::numeric, (e->>'t')::numeric, 0) desc, src desc) rn
    from alle where jsonb_typeof(e) = 'object' and e ? 'id'
  )
  select coalesce(jsonb_agg(e order by coalesce((e->>'t')::numeric, 0), e->>'id' collate "C"), '[]'::jsonb)
  from ranked
  where rn = 1 and not (coalesce(del, '[]'::jsonb) ? (e->>'id'))
$$;

-- 消した印をまとめる（重複なし・並びは名前順）
create or replace function public.docs_merge_dels(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x collate "C"), '[]'::jsonb) from (
    select jsonb_array_elements_text(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) x
    union
    select jsonb_array_elements_text(case when jsonb_typeof(b) = 'array' then b else '[]'::jsonb end)
  ) s
$$;

-- 差分（patch）を足し合わせる：上の段のキーは差分で上書き、entries だけはidごとに足し合わせる
create or replace function public.docs_merge(old_d jsonb, patch jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare res jsonb; del jsonb;
begin
  res := coalesce(old_d, '{}'::jsonb) || (coalesce(patch, '{}'::jsonb) - 'entries' - 'entriesDel');
  if (patch ? 'entries') or (patch ? 'entriesDel') then
    del := public.docs_merge_dels(old_d->'entriesDel', patch->'entriesDel');
    res := jsonb_set(res, '{entries}', public.docs_merge_entries(old_d->'entries', patch->'entries', del));
    if jsonb_array_length(del) > 0 then res := jsonb_set(res, '{entriesDel}', del); else res := res - 'entriesDel'; end if;
  end if;
  return res;
end $$;

-- days は、まるごと書き込まれても（古い画面・チャットのClaudeなど）記録（entries）だけは足し合わせる。
-- ほかのキーは書き込まれた内容のまま
create or replace function public.docs_days_guard() returns trigger language plpgsql set search_path = '' as $$
declare del jsonb;
begin
  if new.collection = 'days' and old.data ? 'entries' then
    del := public.docs_merge_dels(old.data->'entriesDel', new.data->'entriesDel');
    new.data := jsonb_set(new.data, '{entries}', public.docs_merge_entries(old.data->'entries', new.data->'entries', del));
    if jsonb_array_length(del) > 0 then new.data := jsonb_set(new.data, '{entriesDel}', del); else new.data := new.data - 'entriesDel'; end if;
  end if;
  return new;
end $$;
drop trigger if exists docs_days_guard on public.docs;
create trigger docs_days_guard before update on public.docs for each row execute function public.docs_days_guard();

-- アプリ版：差分を送って、サーバー側で足し合わせる。足し合わせた後の内容を返す
create or replace function public.docs_patch(p_col text, p_id text, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.docs(user_id, collection, id, data) values (uid, p_col, p_id, public.docs_merge(null, p_patch))
  on conflict (user_id, collection, id) do update set data = public.docs_merge(public.docs.data, p_patch)
  returning data into res;
  return res;
end $$;
revoke all on function public.docs_patch(text, text, jsonb) from public, anon;
grant execute on function public.docs_patch(text, text, jsonb) to authenticated;

-- チャットのClaudeが記録を消すときも、消した印を残す（足し合わせで復活しないように）
create or replace function ops.delete_entry(p_day text, p_id text)
returns jsonb language plpgsql as $$
declare doc jsonb := ops.get('days', p_day);
begin
  if doc is null then raise exception 'その日の記録がない'; end if;
  perform ops.put('days', p_day, (doc - 'entriesDel') || jsonb_build_object(
    'entriesDel', public.docs_merge_dels(doc->'entriesDel', jsonb_build_array(p_id))));
  return jsonb_build_object('day', p_day, 'deleted', p_id);
end $$;
