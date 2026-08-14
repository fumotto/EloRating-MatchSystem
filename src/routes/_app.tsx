// AppLayout（05_Frontend.md 6章）。共通ヘッダー・ナビゲーション・Realtime購読の一括管理。
//
// ★画面側のガードは利便性のためのものであり、認可の保証はバックエンドが行う（5.3）。
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
import { MainNav } from "../components/layout/MainNav";
import { useRealtimeSubscription } from "../features/realtime/useRealtimeSubscription";

function AppLayout() {
  const { session } = Route.useRouteContext();

  // 購読は画面ごとではなくレイアウトで一括管理し、アンマウントで解除する（10.1）。
  useRealtimeSubscription(true);

  return (
    <>
      <Header>
        <MainNav session={session} />
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
