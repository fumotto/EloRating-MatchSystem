// Supabase クライアント（外部ライブラリのラッパー / 05_Frontend.md 4章）。
//
// ★Supabase SDK を直接触ってよいのは services/ 配下のみである（05_Frontend.md 17章）。
//   Component・Hook から本モジュールを import してはならない。
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env へ設定してください（.env.example 参照）",
  );
}

// セッションの保存先キーを明示する。
// 既定値は URL から推測されるため環境ごとに変わり、E2E がセッションを注入できない。
export const AUTH_STORAGE_KEY = "elorating-auth";

// Anon Key は公開される前提の鍵である。Service Role Key を設定してはならない（11_Deployment.md 4.1）。
export const supabase = createClient(url, anonKey, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

// E2E（Playwright）がログイン状態を作るための口。
//
// ★開発ビルドでのみ生やす。`import.meta.env.DEV` は本番ビルドで false に畳まれ、
//   このブロックごと除去されるため、公開物にクライアントは露出しない。
//
// localStorage へセッションを流し込む方式は採らない。保存形式は SDK の内部仕様であり、
// 版が上がると黙って動かなくなる。SDK自身にログインさせるのが最も壊れにくい。
if (import.meta.env.DEV) {
  (globalThis as unknown as { __supabaseForTest?: typeof supabase }).__supabaseForTest = supabase;
}
