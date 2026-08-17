// Route（05_Frontend.md 3章）。
// 過去のシーズンは未認証でも閲覧できる（ADR-018 と同じ扱い）。ガードを付けてはならない。
import { createFileRoute } from "@tanstack/react-router";
import { SeasonRankingPage } from "../../features/season/components/SeasonRankingPage";

export const Route = createFileRoute("/_public/seasons")({
  component: SeasonRankingPage,
});
