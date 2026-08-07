// Route（05_Frontend.md 3章）。ルート定義とガードのみ。業務ロジックを持たない。
import { createFileRoute } from "@tanstack/react-router";
import { RankingPage } from "../../features/ranking/components/RankingPage";

// 未認証でも閲覧できる（ADR-018）。ガードを付けてはならない。
export const Route = createFileRoute("/_public/ranking")({
  component: RankingPage,
});
