-- 夜モードの「ペットの一言」：api_daylog.call の 'chat' に kind（'night' だけ）を通す
do $m$
declare d text; old text := 'jsonb_build_object(''uid'', me, ''messages'', p->''messages'')';
begin
  d := pg_get_functiondef('api_daylog.call'::regproc);
  if position(old in d) > 0 then
    d := replace(d, old, 'jsonb_build_object(''uid'', me, ''messages'', p->''messages'', ''kind'', case when p->>''kind'' = ''night'' then ''night'' end)');
    execute d;
  elsif position('''kind'', case when p->>''kind'' = ''night''' in d) = 0 then
    raise exception 'chat の行が見つからない';
  end if;
end $m$;
