import { createFileRoute } from "@tanstack/react-router";
import { MatchListPage } from "../../features/match/components/MatchListPage";

export const Route = createFileRoute("/_app/matches/")({
  component: MatchListPage,
});
