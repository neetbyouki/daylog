# Daylog のテスト

Playwright で claude.ai 版の画面を開き、押して確かめる。本物のサーバー・カレンダーにはつながない（作り物の返事を返す）。

## はじめて回すとき
```
cd tests
npm install
npx playwright install chromium
```
Python 3 も要る（`tools/build_claude.py` で画面を作るため）。

## 回し方
```
node tests/run.js              # 全部（suites.json の順）
node tests/run.js promises quiz # 一部だけ
```
- まず作り物のカレンダー（`fixtures/cals.json`）で `tests/.out/daylog.html` を作り、各テストを `tests/.out` の中で動かす
- 画面写真（`*.png`）も `tests/.out` に出る。git には入れない
- 最後に「ぜんぶ通った」か、通らなかったテストの名前が出る

## 主なテスト
| 名前 | 確かめること |
|---|---|
| promises | 自分との約束（今日タブのピル・今日の流れ・夜モード・目標の編集・ふりかえりのグラフ） |
| quiz | ペットの育成：3問を受け取る・答える・スキップ・評価・成長となつき |
| pet | ペット：育ち・ごはん・おかわり・ボーナス・旅・手紙・おはなし |
| flow | 今日の流れ（空きの帯・予定・記録） |
| mo | カレンダーの月の画面で選んだ日の流れ |
| sleepfix | 寝た時刻の手直し |
| notes / tm | メモ・ノート／タイマー |
| drag / motion / jitter | ドラッグ／画面の動き／左右のずれ |
| allday | 終日の予定 |
| gx / gx3 | 星空の銀河 |
| bk | 記録の守り（バックアップ・エラー） |
| claude | claude.ai 版のつなぎ |
| tmpush / look / nova2 | タイマーの通知・見た目 |

## 書き方のきまり
- `common.js` の `D`（今日・朝6時区切り）、`Y`（きのう）、`at(日付, 時, 分)`（日本時間の時刻）、`seedDocs()`（最初の記録）を使う
- 時計は `p.clock.setFixedTime(new Date(at(D, 13, 0)))` で止める
- カレンダーの作り物は `a.calendarId.startsWith('test-app')` のときだけ予定を返す
- 本物の値（メール・カレンダー ID・持ち主の ID・日記の中身）を書かない
- 1行ずつ `OK  名前` / `NG  名前` を出し、最後に `ALL OK` か `SOME NG`
