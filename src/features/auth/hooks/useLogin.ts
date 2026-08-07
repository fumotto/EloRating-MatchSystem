// ViewModel Hook（05_Frontend.md 3章）。画面の状態と操作をまとめる。
// ★API 呼び出しそのものは Backend Client が行う。
import { useState } from "react";
import { authClient } from "../../../services/authClient";
import { AUTH_PROVIDERS } from "../authProvider";
import { errorMessage } from "../../../utils/errorMessage";

export function useLogin() {
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function login(providerId: (typeof AUTH_PROVIDERS)[number]["id"]) {
    setPendingProvider(providerId);
    setMessage(null);
    try {
      // ログイン後は Dashboard へ戻す（05_Frontend.md 7章）。
      await authClient.signInWithOAuth(providerId, `${window.location.origin}/dashboard`);
    } catch {
      setMessage(errorMessage("AUTH-002"));
      setPendingProvider(null);
    }
  }

  return { providers: AUTH_PROVIDERS, login, pendingProvider, message };
}
