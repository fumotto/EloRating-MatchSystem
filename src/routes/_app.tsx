// AppLayout（05_Frontend.md 6章）。共通ヘッダー・ナビゲーション・Realtime購読の一括管理。
// Realtime の購読は S5 で実装する（10章）。
//
// ★画面側のガードは利便性のためのものであり、認可の保証はバックエンドが行う（5.3）。
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
import { authClient } from "../services/authClient";

function AppLayout() {
  return (
    <>
      <Header>
        <Link to="/dashboard" className="text-sm text-slate-600 dark:text-slate-300">
          ダッシュボード
        </Link>
        <button
          type="button"
          onClick={() => void authClient.signOut()}
          className="text-sm text-slate-600 dark:text-slate-300"
        >
          ログアウト
        </button>
      </Header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});
