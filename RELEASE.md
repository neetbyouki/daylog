# 更新のしかた（Web版と claude.ai 版を必ず同じにする）

元のファイルは1組。**直すのは `index.html`（見た目）と `app/` の部品（本体）だけ。** claude.ai 版のために別のファイルを直さない。

## 本体の部品（app/）
読み込む順は `app/parts.json`。アプリ版は boot.js、claude.ai 版は tools/build_claude.py が、この順に1つにつないで1つの関数の中で動かす（部品どうしで名前をそのまま使える）。
| ファイル | 中身 |
|---|---|
| core.js | 設定・小道具・状態・書き込み・集計、描画の土台（render・動き・下のタブ・見出し）、知らせ、共通の操作（A） |
| drag.js | ドラッグの仕組み（タスクの並べかえ・予定を動かす共通部分） |
| calendar.js | Googleカレンダーの読み書き、カレンダーの画面、予定のシート、予定を動かす |
| today.js | 今日の画面、就寝の目安、予定の終了・キャンセル、時刻の手直し、朝の予定 |
| tasks.js | タスク、目標、タイマー、タスクの並べかえ |
| memos.js | ひとこと、ノート（フォルダ・書く画面・画像）、お気に入り |
| sky.js | 星空（銀河の読み込み・前からの描きかた）、まとめ |
| night.js | 夜モード、シート |
| settings.js | 設定の画面、記録の守り、Daylogからの通知、PCの見張り役 |
| main.js | イベントの配線と起動（最後に読む） |
- 部品の一番外で**すぐ動く文**（const の値・addEventListener など）は、先に読む部品の const / let しか使えない。関数（function）はどこからでも呼べる
- 新しい部品を足したら parts.json に書く（sw.js も parts.json を見て覚える）

1. `index.html` / `app/*.js` を直す（つなぎの違いが要るときだけ `boot.js`＝Web版、`claude/shim.js`＝claude.ai版）
2. 確認：`node tests/run.js`（テストの説明は tests/README.md）。Web版の画面と、`tools/build_claude.py` で作った claude.ai 版の両方で動くか
3. GitHub に push（Web版が1〜2分で更新される。`boot.js` の VERSION も上げる）
4. `python3 tools/build_claude.py <カレンダーidのJSON> <出力.html>` で claude.ai 版を作り、アーティファクト（Daylog）に公開
5. データベースの形を変えたときは、両方の版で読めるか確かめる（データは同じ `public.docs`）

## 見た目（Nova）を変えるとき
- 編集するのは theme/nova.css。`python3 tools/build_theme.py` で index.html の `<style id="nova">` に反映する（各セレクタに html:not(.classic) が付く）
- 「前の見た目」は index.html の元のスタイルそのまま。設定の「見た目」で切り替える（settings.look）
