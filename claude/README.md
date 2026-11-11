# claude.ai 版 Daylog

claude.ai のアーティファクトとして開く版。画面は daylog.js と同じで、つなぎ（shim.js）だけが違う。
- データ：Supabase コネクタの execute_sql で `public.docs` を読み書き（書き込みは `ops.put` / `ops.del`）
- 予定：Google Calendar コネクタ
- PCの記録：データベースの中で `pc_summarize` が作る `pc/<日付>` を読むだけ
- カレンダーのidは公開しないため、このリポジトリには入れていない（アーティファクトの中だけ）
