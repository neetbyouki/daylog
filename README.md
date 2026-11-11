# Daylog

自分用の生活記録アプリ（日記・予定・タスク・目標・星空）。

- 画面：GitHub Pages（このリポジトリ）
- データ：Supabase（行ごとの権限で本人だけが読み書き）
- 予定：Googleカレンダー（Supabaseの関数 `daylog` が中継）
- PCの記録：PCの見張り役が `pc_ingest` に送る

データはこのリポジトリには入っていません。
