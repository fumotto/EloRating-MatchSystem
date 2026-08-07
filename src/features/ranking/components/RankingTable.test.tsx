import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankingTable } from "./RankingTable";
import type { RankingEntry } from "../../../types/api";

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
});
