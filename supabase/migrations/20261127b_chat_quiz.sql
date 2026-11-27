-- 育成の3問：api_daylog.call の 'chat' に kind 'quiz'（今日の3問を作る）・'quizReview'（答えの評価）と、その答え（quiz）を通す
do $m$
declare d text; old text := '''kind'', case when p->>''kind'' = ''night'' then ''night'' end)';
begin
  d := pg_get_functiondef('api_daylog.call'::regproc);
  if position(old in d) > 0 then
    d := replace(d, old, '''kind'', case when p->>''kind'' in (''night'', ''quiz'', ''quizReview'') then p->>''kind'' end, ''quiz'', case when p->>''kind'' = ''quizReview'' and jsonb_typeof(p->''quiz'') = ''object'' and octet_length((p->''quiz'')::text) <= 20000 then p->''quiz'' end)');
    execute d;
  elsif position('''quizReview''' in d) = 0 then
    raise exception 'chat の行が見つからない';
  end if;
end $m$;
