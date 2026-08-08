-- Realtime 設定
--
-- 実装方式は Broadcast である（04_BackendInterface.md 7章）。
-- Edge Functions がトランザクションのコミット成功後に明示的に送信する。
--
-- ★Postgres Changes（テーブル変更の自動購読）は使用しない。
--   RLSとの組み合わせが複雑になり、送信タイミングを制御できないためである。
--   したがって業務テーブルを supabase_realtime パブリケーションへ追加してはならない。
--   ここでは「追加されていないこと」を Migration として明示し、誤って追加された場合に外す。

DO $$
DECLARE
    tbl TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RETURN;
    END IF;

    FOR tbl IN
        SELECT tablename
          FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
    LOOP
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', tbl);
    END LOOP;
END;
$$;

-- チャンネルは public（private: false）として運用する。
--
-- 通知の payload に載せるのは対象のIDだけであり、クライアントは受信後に必ずデータを
-- 再取得する（04_BackendInterface.md 14章）。再取得は各テーブルのRLSを通るため、
-- 購読できること自体が権限の抜け道にはならない。
--
-- private チャンネルへ移行する場合は realtime.messages へRLSポリシーが必要になる。
-- その際は本ファイルではなく新しい Migration を追加し、ADR を残すこと。
