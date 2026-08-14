// ViewModel Hook（05_Frontend.md 3章）。画面の状態と操作をまとめる。
// ★API 呼び出しそのものは Backend Client が行う。
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "../../../services/authClient";
import { errorMessage } from "../../../utils/errorMessage";

export function useLogout() {
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function logout() {
    setIsPending(true);
    setMessage(null);
    try {
      await authClient.signOut();

      // ★セッションを消すだけでは画面が変わらない。
      //   _app の beforeLoad はナビゲーション時にしか評価されず、
      //   RouterProvider の context が null に変わっても再判定されない。
      //   そのため明示的に遷移する。これが無いと「押しても何も起きない」ように見える。
      //
      // 遷移先は未認証で閲覧できる /ranking とする（ADR-018）。
      // /login にすると、ログアウト直後に再ログインを促す形になり不自然である。
      await navigate({ to: "/ranking" });
    } catch {
      setMessage(errorMessage("SYSTEM-001"));
    } finally {
      setIsPending(false);
    }
  }

  return { logout, isPending, message };
}
