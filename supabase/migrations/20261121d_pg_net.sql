-- pg_net を public から extensions へ（Supabaseの警告 extension_in_public）
-- 関数は今まで通り net.http_post（net スキーマ）。入れ直すだけで、cron の呼び出し方は変わらない
drop extension if exists pg_net;
create extension pg_net with schema extensions;
