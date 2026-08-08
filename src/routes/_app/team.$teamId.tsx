import { createFileRoute } from "@tanstack/react-router";
import { TeamDetailPage } from "../../features/team/components/TeamDetailPage";

export const Route = createFileRoute("/_app/team/$teamId")({
  component: TeamDetailPage,
});
