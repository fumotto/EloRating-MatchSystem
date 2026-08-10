// アプリケーション初期化・Provider（05_Frontend.md 4章・6章）。
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
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
