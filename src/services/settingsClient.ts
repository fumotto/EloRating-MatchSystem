// Backend Client（05_Frontend.md 3章）。公開表示設定の取得。
//
// ★system_settings ではなく public_settings ビューを読む。
//   前者は認証済みにしか GRANT していない（0013_rls.sql）。
//   トップページとルールページは未ログインで表示するため、
//   公開用の列だけを返すビューを経由する（Migration 0018）。
import { supabase } from "../lib/supabase";
import type { PublicSettings } from "../types/api";

export const settingsClient = {
  async fetchPublicSettings(): Promise<PublicSettings> {
    const { data, error } = await supabase.from("public_settings").select("*").single();

    if (error) throw error;
    return data as PublicSettings;
  },
};
