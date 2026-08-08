import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsPage } from "../../features/admin/components/AdminSettingsPage";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: AdminSettingsPage,
});
