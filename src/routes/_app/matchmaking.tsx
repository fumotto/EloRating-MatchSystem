import { createFileRoute } from "@tanstack/react-router";
import { MatchmakingPage } from "../../features/match/components/MatchmakingPage";

export const Route = createFileRoute("/_app/matchmaking")({
  component: MatchmakingPage,
});
