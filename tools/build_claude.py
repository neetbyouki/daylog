#!/usr/bin/env python3
"""claude.ai 版 Daylog（アーティファクト用の1ファイル）を、Web版と同じ元ファイルから作る。

使い方: python3 tools/build_claude.py <カレンダーidのJSONファイル> <出力先.html>
- 元にするのは index.html（見た目と骨組み）と daylog.js（本体）。Web版と同じファイル。
- claude.ai 版で違うのは「つなぎ」だけ（claude/shim.js）。
- カレンダーのidは公開リポジトリに入れないので、外のJSONファイルから読む。
"""
import json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
js = (root / 'daylog.js').read_text(encoding='utf-8')
shim = (root / 'claude' / 'shim.js').read_text(encoding='utf-8')
store = (root / 'store.js').read_text(encoding='utf-8')  # 記録置き場（アプリ版と共通）
cals = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
out = pathlib.Path(sys.argv[2])

def rep(s, old, new):
    if s.count(old) != 1:
        raise SystemExit(f'置き換え先が見つからない（{s.count(old)}件）: {old[:60]}')
    return s.replace(old, new)

# 本体の「つなぎ」の呼び出しを claude.ai 版のものに差し替える
js = rep(js, "  if (!window.claude || typeof window.claude.use !== 'function') { S.fatal = 'Daylogを読み込めなかった。開き直してほしい。'; render(); return; }",
            "  if (!window.claude || typeof window.claude.use !== 'function') { S.fatal = 'Daylogはclaude.aiの中で開くと動く。'; render(); return; }")
js = rep(js, "const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);",
            "const [db, user] = await Promise.all([__rt.use('db'), __rt.use('user')]);")
js = rep(js, "  window.claude.use('mcp').then(m =>", "  __rt.use('mcp').then(m =>")
js = rep(js, "  if (!db) { S.fatal = '記録の保存先につながらなかった。開き直してほしい。'; render(); return; }",
            "  if (!db) { S.fatal = 'Supabaseのコネクタにつながらなかった。claude.aiの設定でSupabaseをつないで、開き直してほしい。'; render(); return; }")
js = rep(js, "  S.fatal = '記録を読み込めなかった。今の記録は消えていない（読み込めるまで何も書き込まない）。少し待ってもう一度読み込んでほしい。';",
            "  S.fatal = 'Supabaseから記録を読めなかった。今の記録は消えていない（読み込めるまで何も書き込まない）。Supabaseの使用を許可しているか確かめて、もう一度読み込んでほしい。';")
# 設定の「つながり」：ログイン関係は claude.ai 版では使わないので、説明に差し替える
i = js.index('    <div class="item"><div class="l">Googleカレンダー<small>')
j = js.index('    <div class="item"><div class="l">PCの見張り役<small>')
js = js[:i] + '    <div class="item"><div class="l">このページ<small>claude.ai版。データはアプリ版（https://neetbyouki.github.io/daylog/）と同じ。もう一方で書いた分は15秒ほどで出てくる。</small></div></div>\n' + js[j:]
k = js.index('    <div class="item"><div class="l">ログイン中<small>')
js = js[:k] + js[js.index('\n', k) + 1:]

head = html[html.index('<link rel="preconnect"'):html.index('</head>')].replace('<link rel="manifest" href="manifest.webmanifest">', '')
body = html[html.index('<body>') + 6:html.index('<div id="boot"')]
page = ('<title>Daylog</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">\n'
        + head.strip() + '\n' + body.strip() + '\n<script>\n'
        + 'window.__daylogCals = ' + json.dumps(cals, ensure_ascii=False) + ';\n'
        + store + '\n' + shim + '\n' + js + '</script>\n')
out.write_text(page, encoding='utf-8')
print('built', out, len(page))
