import { createFileRoute } from "@tanstack/react-router";
import { AdminAbuseReportsPage } from "../../features/abuse/components/AdminAbuseReportsPage";

export const Route = createFileRoute("/_admin/admin/reports")({
  component: AdminAbuseReportsPage,
});
