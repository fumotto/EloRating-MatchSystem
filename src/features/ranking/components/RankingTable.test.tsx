import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RankingTable } from "./RankingTable";
import type { RankingEntry } from "../../../types/api";

// Link は Router のコンテキストを必要とする。表示だけを見たいので、
// 遷移先の経路だけを持つ最小の Router を組む。
function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const teamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/team/$teamId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([teamRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // 実アプリの型に対して検証済みの経路のみを使う。テスト用 Router は実行時の解決にだけ使う。
  return render(<RouterProvider router={router as never} />);
}

// Frontend Test（10_TestSpecification.md 3章 / ADR-012）。
// Backend Client はモック化し、UIロジックを独立して検証する（05_Frontend.md 16章）。
const entries: RankingEntry[] = [
  {
    teamId: "t1",
    teamName: "TEAM_A",
    rating: 1500,
    rank: 1,
    wins: 3,
    losses: 1,
    matches: 4,
    winRate: 0.75,
  },
];

describe("RankingTable", () => {
  it("renders a row for each team", () => {
    // TC-UI-104
    render(<RankingTable entries={entries} />);

    expect(screen.getByText("TEAM_A")).toBeInTheDocument();
    expect(screen.getByText("1500")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows an empty state when there are no teams", () => {
    // TC-UI-105
    render(<RankingTable entries={[]} />);

    expect(screen.getByText("まだチームがありません")).toBeInTheDocument();
  });

  it("shows a placeholder win rate when no match has been played", () => {
    // TC-UI-106
    // win_rate は分母0のとき NULL になる（0011_views.sql）。0% と表示してはならない。
    render(
      <RankingTable entries={[{ ...entries[0], wins: 0, losses: 0, matches: 0, winRate: null }]} />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not link team names for signed-out visitors", () => {
    // TC-UI-107
    // ★メンバー一覧は認証済み限定である。押せてもログイン画面へ弾かれるだけになる。
    render(<RankingTable entries={entries} />);
    expect(screen.queryByRole("link", { name: "TEAM_A" })).not.toBeInTheDocument();
    expect(screen.getByText("TEAM_A")).toBeInTheDocument();
  });

  it("links team names to the member list when signed in", async () => {
    // TC-UI-108
    // RouterProvider は初回描画では中身を出さない。解決を待ってから確認する。
    renderWithRouter(<RankingTable entries={entries} linkTeams />);
    expect(await screen.findByRole("link", { name: "TEAM_A" })).toHaveAttribute("href", "/team/t1");
  });
});
