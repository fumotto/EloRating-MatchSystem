// PublicLayout（05_Frontend.md 6章）。未ログイン向けヘッダーとログイン導線。
//
// ★/ranking は ADR-018 により未認証で閲覧できるため、本レイアウト配下に置く。
//   認証済みユーザーにも同一のルートを使う。AppLayout 側に重複したランキング画面を作らない（5.2）。
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
import { useRealtimeSubscription } from "../features/realtime/useRealtimeSubscription";

function PublicLayout() {
  const { session } = Route.useRouteContext();

  // 未認証時は ranking チャンネルのみ購読する（10.1）。
  // 認証済みで公開ルートを見ている場合は AppLayout 側が全チャンネルを持つ。
  useRealtimeSubscription(false);

  return (
    <>
      <Header>
        {session ? (
          <Link to="/dashboard" className="text-sm text-slate-600 dark:text-slate-300">
            ダッシュボード
          </Link>
        ) : (
          <Link to="/login" className="text-sm text-slate-600 dark:text-slate-300">
            ログイン
          </Link>
        )}
      </Header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

export const Route = createFileRoute("/_public")({
  component: PublicLayout,
});
