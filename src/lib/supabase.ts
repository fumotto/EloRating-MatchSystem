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

// Anon Key は公開される前提の鍵である。Service Role Key を設定してはならない（11_Deployment.md 4.1）。
export const supabase = createClient(url, anonKey);
