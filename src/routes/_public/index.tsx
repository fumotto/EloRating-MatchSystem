// Route（05_Frontend.md 3章）。ルート定義とガードのみ。
//
// ★以前は /ranking へリダイレクトしていたが、トップページを設けた（Issue #8）。
//   ランキングへは、トップの「ログインせずに入場」から進む。
import { createFileRoute } from "@tanstack/react-router";
import { TopPage } from "../../features/site/components/TopPage";

export const Route = createFileRoute("/_public/")({
  component: TopPage,
});
