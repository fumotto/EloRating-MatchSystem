// セッション購読（05_Frontend.md 7.1）。
// ★Session は Supabase Auth が保持する。フロントエンドで JWT を保存しない。
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authClient } from "../../../services/authClient";

export interface SessionState {
  session: Session | null;
  isLoading: boolean;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    authClient.getSession().then((s) => {
      if (!active) return;
      setSession(s);
      setIsLoading(false);
    });

    const unsubscribe = authClient.onAuthStateChange((s) => {
      if (!active) return;
      setSession(s);
      setIsLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { session, isLoading };
}
