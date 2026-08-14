// PublicLayout（05_Frontend.md 6章）。未ログイン向けヘッダーとログイン導線。
//
// ★/ranking は ADR-018 により未認証で閲覧できるため、本レイアウト配下に置く。
//   認証済みユーザーにも同一のルートを使う。AppLayout 側に重複したランキング画面を作らない（5.2）。
//
// ★認証済みで公開ルートを見ている場合も AppLayout と同じ導線を出す（MainNav が分岐する）。
//   ここだけ「ダッシュボード」への1本にすると、ランキングから設定などへ直接移動できず、
//   利用者は一度ダッシュボードを経由させられる。
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";
import { MainNav } from "../components/layout/MainNav";
import { useRealtimeSubscription } from "../features/realtime/useRealtimeSubscription";

function PublicLayout() {
  const { session } = Route.useRouteContext();

  // 未認証時は ranking チャンネルのみ購読する（10.1）。
  // 認証済みで公開ルートを見ている場合は AppLayout 側が全チャンネルを持つ。
  useRealtimeSubscription(false);

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

export const Route = createFileRoute("/_public")({
  component: PublicLayout,
});
