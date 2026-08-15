// アプリケーション初期化・Provider（05_Frontend.md 4章・6章）。
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { routeTree } from "../routeTree.gen";
import { queryClient } from "./queryClient";
import { ErrorBoundary } from "./ErrorBoundary";
import { useSession } from "../features/auth/hooks/useSession";
import { useEnsureProfile } from "../features/profile/hooks/useEnsureProfile";

// セッションはコンテキスト経由でガードへ渡す（05_Frontend.md 5.3）。
const router = createRouter({
  routeTree,
  context: { session: null },
  basepath: import.meta.env.BASE_URL,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const { session, isLoading } = useSession();
  const ensureProfile = useEnsureProfile();

  // ★セッションが「変わったとき」だけルータのマッチを作り直す。
  //
  //   RouterProvider の context を差し替えても、読み込み済みのマッチが持つ
  //   コンテキストは再計算されない。beforeLoad はナビゲーション時にしか
  //   評価されないためである（TanStack Router の設計）。
  //   invalidate を呼ばないと、ログアウト後もヘッダーが旧セッションのまま
  //   「ログアウト」を出し続ける。ガードも旧セッションで通ったままになる。
  //
  //   ★初回に呼んではならない。isLoading の間は下で RouterProvider を描画しないため、
  //     ルータのコンテキストは createRouter 時の { session: null } のままである。
  //     そこへ invalidate を投げると _app のガードが未ログインと判定して /login へ飛ばし、
  //     セッション確定後に /login のガードが /dashboard へ跳ね返す。
  //     結果、保護ルートへの直接遷移がすべて /dashboard に化ける。
  //     初回の読み込みはルータ自身が正しいコンテキストで行うので、何もしなくてよい。
  //
  //   ★比較対象は利用者IDにする。セッションオブジェクトはトークン更新のたびに
  //     同一性が変わるため、そのまま比べると1時間ごとに全マッチを作り直すことになる。
  const lastUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (isLoading) return;

    const userId = session?.user.id ?? null;

    // undefined は「まだ一度も観測していない」を表す。null（未ログイン）とは区別する。
    if (lastUserId.current === undefined) {
      lastUserId.current = userId;
      return;
    }

    if (lastUserId.current === userId) return;

    lastUserId.current = userId;
    void router.invalidate();
  }, [isLoading, session?.user.id]);

  // ログイン確立後に ensure-profile を呼ぶ（05_Frontend.md 7章 / 04_BackendInterface.md 4.1）。
  useEffect(() => {
    if (!session) return;
    const meta = session.user.user_metadata as Record<string, string | undefined>;
    ensureProfile.mutate({
      displayName: meta.full_name ?? meta.name ?? meta.user_name ?? "プレイヤー",
      avatarUrl: meta.avatar_url,
    });
    // セッションが変わったときだけ実行する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-slate-500">読み込み中…</p>;
  }

  return <RouterProvider router={router} context={{ session }} />;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
