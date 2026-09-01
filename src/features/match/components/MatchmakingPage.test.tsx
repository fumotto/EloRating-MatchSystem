// マッチング画面の停止案内と進行中の試合（TC-UI-242〜245 / TC-UI-267〜269 /
// Issue #9 / ADR-034 ⑤ / ADR-035 ⑤ / ADR-038 ③ / ADR-039 ⑧）。
//
// ★原則は「押してからエラーにしない」である。停止していることと、その理由を先に見せる。
//   保守停止（ADR-034 ⑤）を見落としていたため、その間は案内が出ないままボタンが押せ、
//   QUEUE-007 で弾かれていた。停止の種類が増えたら、必ずここへ足す。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SeasonOperationState } from "../../../types/season";

let seasonState: SeasonOperationState;
let activeMatches: {
  id: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  status: string;
}[];

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({ session: { user: { id: "profile-1" } } }),
  // 進行中の試合は試合詳細へのリンクとして並ぶ。遷移そのものは検証しない。
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../team/hooks/useMyTeam", () => ({
  useMyTeam: () => ({ data: { id: "team-1", name: "自チーム" }, isPending: false }),
}));

vi.mock("../../team/hooks/useTeamDetail", () => ({
  useTeamDetail: () => ({ data: { memberCount: 3 } }),
}));

vi.mock("../../settings/hooks/useSystemSettings", () => ({
  useSystemSettings: () => ({ data: { team_max_members: 3 } }),
}));

vi.mock("../hooks/useQueueStatus", () => ({ useQueueStatus: () => ({ data: null }) }));
vi.mock("../hooks/useMatchList", () => ({ useMatchList: () => ({ data: activeMatches }) }));
vi.mock("../hooks/useQueueMatch", () => ({
  useQueueMatch: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }),
}));
vi.mock("../hooks/useCancelQueue", () => ({
  useCancelQueue: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock("../../season/hooks/useSeason", () => ({
  useSeasonState: () => ({ data: seasonState }),
}));

const { MatchmakingPage } = await import("./MatchmakingPage");

const state = (overrides: Partial<SeasonOperationState> = {}): SeasonOperationState => ({
  currentSeason: 1,
  status: "ACTIVE",
  graceUntil: null,
  matchmakingPaused: false,
  updatesLocked: false,
  maintenancePaused: false,
  ...overrides,
});

const startButton = () => screen.getByRole("button", { name: /マッチングを開始/ });

const match = (id: string, opponent: string, status = "PLAYING") => ({
  id,
  teamAId: "team-1",
  teamBId: `opponent-${id}`,
  teamAName: "自チーム",
  teamBName: opponent,
  status,
});

beforeEach(() => {
  seasonState = state();
  activeMatches = [];
});

describe("MatchmakingPage — 停止中の案内", () => {
  it("lets a complete team queue while nothing is paused", () => {
    // TC-UI-242 前提の確認。停止していなければ押せる。
    render(<MatchmakingPage />);
    expect(startButton()).toBeEnabled();
  });

  it("explains the season pause before the button is pressed", () => {
    // TC-UI-243
    seasonState = state({ matchmakingPaused: true });
    render(<MatchmakingPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/シーズンの切り替え中/);
    expect(startButton()).toBeDisabled();
  });

  it("explains the maintenance pause before the button is pressed", () => {
    // TC-UI-244 ★これを見落とすと QUEUE-007 で弾かれるまで理由が分からない。
    seasonState = state({ maintenancePaused: true });
    render(<MatchmakingPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/メンテナンス/);
    expect(startButton()).toBeDisabled();
  });

  it("names maintenance first when both pauses are on", () => {
    // TC-UI-245 ★待つ相手が違う。シーズンは運営の作業待ち、保守はゲーム側の復旧待ちである。
    //   両方立っているなら、復旧しない限り再開しても対戦できない方を先に伝える。
    seasonState = state({ matchmakingPaused: true, maintenancePaused: true });
    render(<MatchmakingPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/メンテナンス/);
    expect(startButton()).toBeDisabled();
  });
});

// 進行中の試合は複数持ちうる（ADR-035 ⑤ / ADR-039 ⑧）。
//
// ★管理者が用意した試合は待機列を経由しないため、1チームへ同時に割り当てられる。
//   先頭の1件だけを案内すると、残りが画面から消える。
describe("MatchmakingPage — 進行中の試合", () => {
  it("lists the single active match", () => {
    // TC-UI-267 自動マッチングだけの運用では常に0件か1件である。
    activeMatches = [match("m1", "相手チーム")];
    render(<MatchmakingPage />);

    expect(screen.getByText("進行中の試合があります")).toBeInTheDocument();
    expect(screen.getByText(/相手チーム/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /マッチングを開始/ })).toBeNull();
  });

  it("lists every active match, not just the first", () => {
    // TC-UI-268 ★これが ADR-039 ⑧ の要求である。
    activeMatches = [match("m1", "アルファ"), match("m2", "ブラボー"), match("m3", "チャーリー")];
    render(<MatchmakingPage />);

    expect(screen.getByText("進行中の試合が 3 件あります")).toBeInTheDocument();
    expect(screen.getByText(/アルファ/)).toBeInTheDocument();
    expect(screen.getByText(/ブラボー/)).toBeInTheDocument();
    expect(screen.getByText(/チャーリー/)).toBeInTheDocument();
  });

  it("ignores matches that belong to other teams", () => {
    // TC-UI-269 一覧には全チームの試合が入る。自チームのものだけを拾う。
    activeMatches = [{ ...match("m1", "アルファ"), teamAId: "other-1", teamBId: "other-2" }];
    render(<MatchmakingPage />);

    expect(screen.queryByText(/進行中の試合/)).toBeNull();
    expect(screen.getByRole("button", { name: /マッチングを開始/ })).toBeEnabled();
  });
});
