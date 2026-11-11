# 更新のしかた（Web版と claude.ai 版を必ず同じにする）

元のファイルは1つ。**直すのは `index.html`（見た目）と `daylog.js`（本体）だけ。** claude.ai 版のために別のファイルを直さない。

1. `index.html` / `daylog.js` を直す（つなぎの違いが要るときだけ `boot.js`＝Web版、`claude/shim.js`＝claude.ai版）
2. 確認：Web版の画面と、`tools/build_claude.py` で作った claude.ai 版の両方で動くか
3. GitHub に push（Web版が1〜2分で更新される。`boot.js` の VERSION も上げる）
4. `python3 tools/build_claude.py <カレンダーidのJSON> <出力.html>` で claude.ai 版を作り、アーティファクト（Daylog）に公開
5. データベースの形を変えたときは、両方の版で読めるか確かめる（データは同じ `public.docs`）
