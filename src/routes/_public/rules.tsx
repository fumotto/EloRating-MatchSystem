// Route（05_Frontend.md 3章）。ルート定義とガードのみ。
//
// ログイン状態を問わず閲覧できる（Issue #8）。ガードを付けてはならない。
import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "../../features/site/components/RulesPage";

export const Route = createFileRoute("/_public/rules")({
  component: RulesPage,
});
