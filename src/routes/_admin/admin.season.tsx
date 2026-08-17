// Route（05_Frontend.md 3章）。ルート定義とガードのみ。
import { createFileRoute } from "@tanstack/react-router";
import { AdminSeasonPage } from "../../features/season/components/AdminSeasonPage";

export const Route = createFileRoute("/_admin/admin/season")({
  component: AdminSeasonPage,
});
