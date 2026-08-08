import { createFileRoute } from "@tanstack/react-router";
import { MatchDetailPage } from "../../features/match/components/MatchDetailPage";

export const Route = createFileRoute("/_app/matches/$matchId")({
  component: MatchDetailPage,
});
