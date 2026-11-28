# Daylog — Claude Code 用のメモ

持ち主ひとりのための生活アプリ（日記・予定・タスク・自分との約束・夜モード・星空・ペット）。
**返事はいつも日本語。** 結論から、表や箇条書きで。推測は「（推測）」と書く。

くわしい仕様（機能ごとの記録）と公開しない値は、**非公開リポジトリ `neetbyouki/daylog-private`** にある：`docs/構成.md`・`cals.json`。読めないときは持ち主に聞く。出し方は `RELEASE.md`、テストは `tests/README.md`。

## 必ず守ること
1. **Web版と claude.ai 版は同じ仕様にする。** 直すのは `index.html`（見た目）と `app/*.js`（本体）だけ。違うのは「つなぎ」だけ：Web版 `boot.js`／claude.ai版 `claude/shim.js`。片方だけの機能を作らない
2. **このリポジトリは公開。個人の値と生活のことを書かない**：メールアドレス、カレンダーの ID、持ち主のアカウント ID、APIキー、通知の鍵、合言葉、記録の中身や生活のようす（仕様の記録も含む）。
   - それらは非公開リポジトリ `neetbyouki/daylog-private` に書く。カレンダーの ID はそこの `cals.json`（手元に置くなら `private/cals.json`。git に入れない）。秘密は Supabase の Edge Function Secrets か表 `push_keys`（サーバーだけが読める）
   - コミット前に `git diff` で個人の値が入っていないか見る
3. **お金**：無料のサービスだけ。例外は Claude API（Haiku 5.5・前払いクレジット）だけ。オートチャージは絶対に入れない
4. **持ち主の記録を勝手に書きかえない。** データベースの記録（`public.docs`）を直すのは頼まれたときだけ。直したら何をしたか伝える
5. **マイクの音を受け取る機能は作らない**
6. ペットのサーバー（`supabase/functions/daylog-chat`）の「守ること」は持ち主が決めた文だけ。勝手に文を足さない
7. 1日の区切りは**朝6時**、時刻はすべて**日本時間**（core.js の `today()`、サーバーの `logicalDate`）

## 作り
| 場所 | 中身 |
|---|---|
| `index.html` | 見た目（CSS）と骨組み。新しい見た目の元は `theme/nova.css` → `python3 tools/build_theme.py` で反映 |
| `app/*.js` | 本体の部品。読む順は `app/parts.json`（core → drag → calendar → today → tasks → memos → sky → night → settings → pet → main）。全部つないで1つの関数の中で動くので、部品どうしで名前をそのまま使える。一番外ですぐ動く文は、先に読む部品の const/let しか使えない |
| `store.js` | 記録の置き場（両方の版で共通。送る箱・端末の控え・取り直し） |
| `boot.js` | Web版のつなぎ（ログイン・Supabase・カレンダーの中継）。`VERSION` がある |
| `claude/shim.js` | claude.ai 版のつなぎ（Supabase コネクタの `api_daylog.call` だけを呼ぶ） |
| `sw.js` | ホーム画面用。キャッシュ名 `daylog-shell-vNN` |
| `galaxy.js` | 星空の銀河（WebGL） |
| `supabase/functions/` | Edge Function：daylog（カレンダー中継・PC）、daylog-chat（ペット＝Claude API）、daylog-push（通知）、daylog-backup（ドライブへの保存）、daylog-img（画像） |
| `supabase/migrations/` | データベースの変更。名前は `YYYYMMDDx_なにか.sql` |
| `tools/build_claude.py` | claude.ai 版を1ファイルにする：`python3 tools/build_claude.py <cals.json> <出力.html>` |
| `pc/` | PC の見張り役（PowerShell）の控え |
| `tests/` | 画面テスト（Playwright）。`node tests/run.js` |

### データ
- 表 `public.docs`（user_id, collection, id, data jsonb）に「コレクション／ドキュメント」の形。行ごとの鍵（RLS）で本人の行だけ
- 主なコレクション：`days/<YYYY-MM-DD>`（その日の全部：entries・mode・promises・close・quiz・pet・evsnap…）、`tasks`、`goals`、`memos`、`notes`、`settings/main`、`pet/main`、`petchat`、`pc/<日付>`、`meta/*`
- 書くときは `patchDay(d, { キー: 値 })`（変えたキーだけ送る。サーバーの docs_merge が足し合わせる）。days をまるごと書きかえない
- チャットの Claude 用に、読む表 `readable.*` と操作の関数 `ops.*` がある（外には公開していない）
- 新しいアカウントの登録はデータベースのトリガーで止めている（持ち主だけ）。daylog-chat は `push_keys.owner_uid` 以外を断る

### CSS の名前の頭（ぶつけない）
`pr-` ペットの部屋／`pq-` 育成の3問／`yk-` 自分との約束／`nv-` 夜の振り返り／`np-` 夜のペットの一言／`nr-` 夜モード（前から）／`gm-` ゲームの帯

## 出し方（毎回この順）
1. 直す（`index.html`・`app/*.js`。つなぎの違いが要るときだけ `boot.js`／`claude/shim.js`）
2. `boot.js` の `VERSION`（例 `'2026-11-28a'`）と `sw.js` のキャッシュ名（`daylog-shell-vNN` の数字）を上げる
3. テスト：`node tests/run.js`（一部だけなら `node tests/run.js promises quiz`）。変えた機能のテストを足す・直す
4. commit（日本語で「何を・なぜ」）→ `main` に push。GitHub Pages が1〜2分で Web版を更新
5. claude.ai 版：`python3 tools/build_claude.py <daylog-private の cals.json> daylog.html` で作り、claude.ai のアーティファクト「Daylog」に公開（Claude Code から公開できないときは、作った daylog.html を claude.ai のチャットに渡して公開してもらう）
6. サーバーを変えたとき：
   - 関数：`supabase functions deploy <名前> --project-ref etsuxjcrnyoevrasdhde --no-verify-jwt`（どの関数も中で自分で確かめるので verify_jwt は切っている）
   - データベース：`supabase/migrations/` に SQL を置いて当てる。当てたら両方の版で読めるか確かめる
7. 大きく変えたら、daylog-private の `docs/構成.md` に機能の記録を足す（公開側には書かない）

## テスト
- `tests/README.md` を見る。作り物の設定（`tests/fixtures/settings.json`）と作り物のカレンダー（`tests/fixtures/cals.json`）で claude.ai 版を作り、本物のサーバーにはつながない
- 時計は `p.clock.setFixedTime` で止める。画面写真は `tests/.out/` に出る（git に入れない）
- サーバー（daylog-chat など）はテストの中で作り物の返事にする。本物で確かめるときは Supabase で `select api_daylog.call('{"a":"chat","kind":"quiz","messages":[]}'::jsonb)` のように呼ぶ（お金が少しかかる）

## ペットのサーバー（daylog-chat）
- モデルは `claude-haiku-5-5`。APIキーは Secrets の `ANTHROPIC_API_KEY`（どこにも書かない）
- kind：なし＝おはなし、`night`＝夜の一言、`quiz`＝育成の3問を作る、`quizReview`＝答えの評価。形を決めたい返事は tool use（`tool_choice`）で受け取る
- 1日150回まで（使いすぎ防止）。使った量は `meta/chatuse`
