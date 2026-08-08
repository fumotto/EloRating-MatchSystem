import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "../../features/admin/components/AdminDashboardPage";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboardPage,
});
