// Backend Client（05_Frontend.md 3章）。Supabase SDK に触れてよい唯一の層。
import type { Provider, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export const authClient = {
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  // プロバイダは呼び出し側が features/auth/authProvider.ts から渡す。
  // ここでも画面でもプロバイダ名を固定しない（ADR-015）。
  async signInWithOAuth(provider: Provider, redirectTo: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthStateChange(callback: (session: Session | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return () => data.subscription.unsubscribe();
  },
};
