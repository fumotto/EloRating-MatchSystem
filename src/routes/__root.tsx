// RootLayout（05_Frontend.md 6章）。
// 責務は Provider・Theme・Error Boundary・Suspense・Toast。業務ロジックを置かない。
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { useThemeStore } from "../stores/themeStore";

// ルートのコンテキスト。ガード（beforeLoad）がセッションを参照する（5.3）。
export interface RouterContext {
  session: Session | null;
}

function RootLayout() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return <Outlet />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="font-medium">ページが見つかりません</p>
    </div>
  ),
});
