import { createFileRoute } from "@tanstack/react-router";
import { AdminTeamsPage } from "../../features/admin/components/AdminTeamsPage";

export const Route = createFileRoute("/_admin/admin/teams")({
  component: AdminTeamsPage,
});
