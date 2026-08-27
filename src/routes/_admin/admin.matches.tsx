import { createFileRoute } from "@tanstack/react-router";
import { AdminMatchesPage } from "../../features/admin/components/AdminMatchesPage";

export const Route = createFileRoute("/_admin/admin/matches")({
  component: AdminMatchesPage,
});
