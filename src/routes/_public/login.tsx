import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "../../features/auth/components/LoginPage";

export const Route = createFileRoute("/_public/login")({
  // ログイン済みならダッシュボードへ（5.3）。
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});
