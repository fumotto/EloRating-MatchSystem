import { createFileRoute } from "@tanstack/react-router";
import { MyTeamPage } from "../../features/team/components/MyTeamPage";

export const Route = createFileRoute("/_app/team/")({
  component: MyTeamPage,
});
