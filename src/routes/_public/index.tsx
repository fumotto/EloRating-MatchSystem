import { createFileRoute, redirect } from "@tanstack/react-router";

// ルートは公開ランキングへ寄せる（ADR-018）。
export const Route = createFileRoute("/_public/")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking" });
  },
});
