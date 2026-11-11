import re
src=open('/home/claude/daylog/daylog.html',encoding='utf-8').read()
a=src.index('<script>'); b=src.index('</script>',a)
head=src[:a]; js=src[a+len('<script>'):b]
def rep(s,old,new,cnt=1):
    n=s.count(old); assert n==cnt,(n,old[:90]); return s.replace(old,new)

# ---------- JS changes for standalone ----------
# calendar ids come from the user's Google account at runtime (not in public code)
js=re.sub(r"(\{ key: '(app|star|i1lz|panda|main|holiday)', name: '[^']*', id: )'[^']*'", r"\1''", js)
js=rep(js,"  APP_CAL: '1128f7d9f8cd48ddd26a0a73bfa80a0a6931e075440ea48893efe73d7a79609d@group.calendar.google.com',","  APP_CAL: '',")
js=rep(js,"const MODES = {","""// カレンダーのidは、ログインしたGoogleアカウントのカレンダー一覧から起動時に入れる
if (window.__daylogCals) { for (const c of CFG.CALS) if (window.__daylogCals[c.key]) c.id = window.__daylogCals[c.key]; CFG.APP_CAL = (window.__daylogCals.app || ''); }
CFG.CALS = CFG.CALS.filter(c => c.id);
const MODES = {""")
js=re.sub(r"const PERSONA = '[^\n]*\n(  '[^\n]*\n)*", "const PERSONA = '';\n", js, count=1)
# boot: no claude.ai checks
js=rep(js,"""  if (!window.claude || typeof window.claude.use !== 'function') { S.fatal = 'Daylogはclaude.aiの中で開くと動く。'; render(); return; }""","""  if (!window.claude || typeof window.claude.use !== 'function') { S.fatal = 'Daylogを読み込めなかった。開き直してほしい。'; render(); return; }""")
js=rep(js,"  if (!db) { S.fatal = '記録の保存先につながらなかった。claude.aiにログインした状態で開き直してほしい。'; render(); return; }","  if (!db) { S.fatal = '記録の保存先につながらなかった。開き直してほしい。'; render(); return; }")
js=rep(js,"  window.claude.use('sample').then(s => { S.sample = s; if (S.ready) maybeBed(); render(); });\n","")
js=rep(js,"if (err && err.code === 'revoked') S.fatal = '記録への接続が切れた。ページを開き直してほしい。';","if (err && err.code === 'revoked') S.fatal = 'ログインが切れた。開き直してほしい。';")
# night: skip Claude step
js=rep(js,"  if (n.step === 4) saveNightPartial();\n","  if (n.step === 4) saveNightPartial();\n  if (n.step === 4 && !claudeReady()) { n.step = 6; render(); return; }\n")
# claude card without claude
js=rep(js,"""<div class="faint" style="font-size:11px;margin-top:6px">Claudeはお休み中。目安は前の晩の就寝時刻と昼寝から計算している。</div></section>`;""","""<div class="faint" style="font-size:11px;margin-top:6px">前の晩の就寝時刻と昼寝から計算した目安。</div></section>`;""")
# review insight hidden without claude
js=rep(js,"  h += `<div class=\"chart\"><div class=\"ct\"><span>Claudeの気づき</span>","  if (claudeReady()) h += `<div class=\"chart\"><div class=\"ct\"><span>Claudeの気づき</span>")
# texts
js=rep(js,"ゲームの記録はまだ届いていない（PCのClaudeアプリで開くと届く）","ゲームの記録はまだ届いていない（PCの見張り役から届く）")
js=rep(js,".｡oOに入る。予定は15分前にスマホへ通知が来る（Claudeの予定済みタスク）。「起きる」は通知しないので、アラームも使ってほしい。",".｡oOに入る。スマホの通知はGoogleカレンダーのアプリから（.｡oOの通知をオンにしておく）。")
# settings: connections
i=js.index("  const pcTxt = {"); j=js.index("  h += `<p class=\"faint\" style=\"font-size:12px;margin-top:16px\">記録はこのページの持ち主だけが")
js=js[:i]+"""  const pcTxt = { ok: `つながっている（${S.pcAt ? hm(S.pcAt) + 'に同期' : ''}${S.pcLastSeen ? ` · 見張り役の最後の連絡 ${hm(S.pcLastSeen)}` : ''}）`, none: 'まだつながっていない。PCの見張り役に合言葉を入れると届くようになる。', error: '同期に失敗した。少しして「今すぐ同期」を押してみて。', unknown: '確認中' }[S.pcStatus];
  h += `<h2 class="sec"><span>つながり</span></h2><div class="card settings">
    <div class="item"><div class="l">Googleカレンダー<small>${S.mcp ? (S.gcalLinked === false ? 'まだ許可されていない。ログインし直すと許可できる。' : 'ログインしたGoogleアカウントのカレンダーを読み書きできる') : '準備中'}</small></div><button class="btn sm" data-act="relogin">ログインし直す</button></div>
    <div class="item"><div class="l">PCの見張り役<small>${pcTxt}</small></div>${S.pcStatus === 'ok' || S.pcStatus === 'error' ? `<div class="row"><button class="btn sm" data-act="syncPC">今すぐ同期</button></div>` : ''}</div>
    <div class="item"><div class="l">ログイン中<small>${esc((S.user && S.user.email) || '')}</small></div><button class="btn sm ghost" data-act="logout">ログアウト</button></div>
  </div>`;
"""+js[j:]
js=rep(js,"記録はこのページの持ち主だけが読み書きできる。リンクを誰かに送っても、日記は見えない設定にしてある。","記録は自分のアカウントだけが読み書きできる。アドレスを誰かに送っても、ログインしないと日記は見えない。")
js=rep(js,"A.toggleClaude = () =>","A.relogin = () => { if (window.daylogRelogin) window.daylogRelogin(); };\nA.logout = () => { if (window.daylogLogout) window.daylogLogout(); };\nA.toggleClaude = () =>")
# PC sync: only recent days when we already have older ones; keep lastSeen
js=rep(js,"    const r = await S.mcp.callTool(CFG.HOST, 'get_activity', { from: addDays(today(), -40), to: today() }, { cache: false });","    const known = Object.keys(S.pc).sort(); const from = known.length && known[known.length - 1] >= addDays(today(), -3) ? addDays(today(), -3) : addDays(today(), -40);\n    const r = await S.mcp.callTool(CFG.HOST, 'get_activity', { from, to: today() }, { cache: false });\n    if (r && r.payload && r.payload.lastSeen) S.pcLastSeen = r.payload.lastSeen;")
js=rep(js,"// PCのClaudeアプリで開いている間は、5分ごとにゲーム時間などを取り直す\nsetInterval(() => { if (S.ready && S.pcStatus === 'ok' && document.visibilityState === 'visible') syncPC(); }, 5 * 60000);","// 開いている間は、5分ごとにPCのゲーム時間などを取り直す\nsetInterval(() => { if (S.ready && S.pcStatus !== 'none' && document.visibilityState === 'visible') syncPC(); }, 5 * 60000);")
js=rep(js,"  // 見張り役が使う項目が変わったときだけ送る（送るたびにClaudeアプリの確認が出るため）","  // 見張り役が使う項目が変わったときだけ送る")
# backup section: text
js=re.sub(r"  const bk = S\.meta && S\.meta\.backup;\n  h \+= `<h2 class=\"sec\"><span>バックアップ</span></h2>[^\n]*\n", "", js, count=1)
assert 'PCへの自動バックアップ' not in js
# bell notify display irrelevant; keep
open('/home/claude/daylog-app/daylog.js','w',encoding='utf-8').write(js.strip()+'\n')

# ---------- index.html ----------
css_and_markup = head
css_and_markup = rep(css_and_markup,'<title>Daylog</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n','')
css_and_markup = rep(css_and_markup,'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">\n','')
i=css_and_markup.index('<style>'); j=css_and_markup.index('</style>')+len('</style>')
style=css_and_markup[i:j]; links=css_and_markup[:i]; markup=css_and_markup[j:]
html=f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Daylog</title>
<meta name="theme-color" content="#0b0e1b">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Daylog">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
{links.strip()}
{style}
<style>
/* スタンドアロン版：上下の安全域とログイン画面 */
body{{padding-top:env(safe-area-inset-top,0px)}}
.login{{max-width:420px;margin:18vh auto 0;padding:0 24px;text-align:center}}
.login h1{{font-family:var(--f-disp);font-size:34px;margin:0 0 6px;letter-spacing:.04em}}
.login p{{color:var(--fg-2);font-size:14px;margin:0 0 24px}}
.login .gbtn{{display:inline-flex;align-items:center;gap:10px;background:var(--fg);color:#111;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:700}}
.login .small{{font-size:12px;color:var(--fg-3);margin-top:18px}}
.boot{{text-align:center;color:var(--fg-3);margin-top:30vh;font-size:13px}}
</style>
</head>
<body>
{markup.strip()}
<div id="boot" class="boot">読み込み中…</div>
<script type="module" src="boot.js"></script>
</body>
</html>
'''
open('/home/claude/daylog-app/index.html','w',encoding='utf-8').write(html)
print('ok', len(js), len(html))
