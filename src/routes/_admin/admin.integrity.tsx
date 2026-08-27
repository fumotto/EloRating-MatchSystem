import { createFileRoute } from "@tanstack/react-router";
import { AdminIntegrityPage } from "../../features/admin/components/AdminIntegrityPage";

export const Route = createFileRoute("/_admin/admin/integrity")({
  component: AdminIntegrityPage,
});
