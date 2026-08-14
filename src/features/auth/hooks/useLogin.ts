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
      //
      // ★origin だけでは足りない。GitHub Pages はサブパスで配信されるため
      //   `/EloRating-MatchSystem/` が落ち、Supabase の許可リストに一致しない。
      //   一致しない redirectTo はエラーにならず Site URL へ黙って差し替えられるため、
      //   ここを誤ると「ログインは成功するのに知らないURLへ飛ぶ」形で現れる。
      //   BASE_URL は Vite が末尾スラッシュ付きで与える（ローカルは "/"）。
      await authClient.signInWithOAuth(
        providerId,
        `${window.location.origin}${import.meta.env.BASE_URL}dashboard`,
      );
    } catch {
      setMessage(errorMessage("AUTH-002"));
      setPendingProvider(null);
    }
  }

  return { providers: AUTH_PROVIDERS, login, pendingProvider, message };
}
