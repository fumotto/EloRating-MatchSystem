// AppLayout（05_Frontend.md 6章）。共通ヘッダー・ナビゲーション・Realtime購読の一括管理。
//
// ★画面側のガードは利便性のためのものであり、認可の保証はバックエンドが行う（5.3）。
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
import { authClient } from "../services/authClient";
import { useRealtimeSubscription } from "../features/realtime/useRealtimeSubscription";

// ランキングは公開ルート（/ranking）に置く。AppLayout 側へ重複して作らない（5.2）。
const NAV = [
  { to: "/dashboard", label: "ダッシュボード" },
  { to: "/team", label: "マイチーム" },
  { to: "/matchmaking", label: "マッチング" },
  { to: "/matches", label: "試合" },
  { to: "/ranking", label: "ランキング" },
  { to: "/profile", label: "プロフィール" },
  { to: "/settings", label: "設定" },
] as const;

function AppLayout() {
  const { session } = Route.useRouteContext();

  // 購読は画面ごとではなくレイアウトで一括管理し、アンマウントで解除する（10.1）。
  useRealtimeSubscription(true);

  const isAdmin = session?.user.app_metadata?.role === "admin";

  return (
    <>
      <Header>
        <nav className="flex flex-wrap items-center gap-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm text-slate-600 dark:text-slate-300"
              activeProps={{ className: "text-sm font-medium text-indigo-600" }}
            >
              {item.label}
            </Link>
          ))}
          {/* 管理者にのみ導線を出す。判定はJWTの app_metadata.role（ADR-020）。 */}
          {isAdmin ? (
            <Link to="/admin" className="text-sm text-slate-600 dark:text-slate-300">
              管理
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void authClient.signOut()}
            className="text-sm text-slate-600 dark:text-slate-300"
          >
            ログアウト
          </button>
        </nav>
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
