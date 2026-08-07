import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../../features/team/components/DashboardPage";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});
