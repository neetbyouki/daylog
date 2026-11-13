#!/usr/bin/env python3
"""theme/nova.css の各セレクタに html:not(.classic) を付けて、index.html の <style id="nova"> に入れる。
設定の「見た目」で「前の見た目」を選ぶと html に .classic が付き、この見た目は外れる。"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'theme' / 'nova.css').read_text(encoding='utf-8')
P = 'html:not(.classic)'
def pre(sel):
    sel = sel.strip()
    if sel.startswith(':root'): return P + sel[len(':root'):]
    if sel == 'html': return P
    return P + ' ' + sel
def walk(css):
    out, i = [], 0
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    while i < len(css):
        j = css.find('{', i)
        if j < 0: break
        head = css[i:j].strip()
        if head.startswith('@media'):
            depth, k = 1, j + 1
            while depth: depth += {'{': 1, '}': -1}.get(css[k], 0); k += 1
            out.append(head + '{' + walk(css[j + 1:k - 1]) + '}')
            i = k; continue
        k = css.find('}', j)
        out.append(','.join(pre(s) for s in head.split(',')) + '{' + css[j + 1:k].strip() + '}')
        i = k + 1
    return '\n'.join(out)
built = walk(src)
html = (root / 'index.html').read_text(encoding='utf-8')
block = '<style id="nova">\n/* 自動生成：theme/nova.css → tools/build_theme.py */\n' + built + '\n</style>'
if '<style id="nova">' in html:
    html = re.sub(r'<style id="nova">.*?</style>', lambda m: block, html, flags=re.S)
else:
    html = html.replace('</head>', block + '\n</head>', 1)
(root / 'index.html').write_text(html, encoding='utf-8')
print('nova rules:', built.count('{'))
