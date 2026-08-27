// 対戦カードの作成画面（TC-UI-260〜266 / ADR-035 ⑤ / ADR-039 ④⑤）。
//
// ★必須人数を要求しないため、人数の不揃いは画面が唯一の手がかりである（ADR-039 ④）。
// ★作成は取り消せない。確認を省略可能にしてはならない（ADR-039 ⑤）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchCandidateTeam } from "../../../types/api";

const mutate = vi.fn();
let candidates: MatchCandidateTeam[];

vi.mock("../hooks/useAdminActions", () => ({
  useMatchCandidates: () => ({ data: candidates, isPending: false }),
  useAdminCreateMatch: () => ({ mutate, isPending: false, error: null, data: null }),
}));

const { AdminMatchesPage } = await import("./AdminMatchesPage");

const team = (overrides: Partial<MatchCandidateTeam> = {}): MatchCandidateTeam => ({
  teamId: "team-a",
  teamName: "アルファ",
  rating: 1500,
  isBanned: false,
  memberCount: 3,
  ...overrides,
});

// ★同じチーム名は両方の select に現れる。必ず対象の select の中で探す。
const pick = async (labelText: string, name: string) => {
  const select = screen.getByLabelText(labelText);
  await userEvent.selectOptions(
    select,
    within(select).getByRole("option", { name: new RegExp(name) }),
  );
};

beforeEach(() => {
  mutate.mockClear();
  candidates = [
    team(),
    team({ teamId: "team-b", teamName: "ブラボー", rating: 1400 }),
    team({ teamId: "team-c", teamName: "チャーリー", rating: 1600 }),
  ];
});

describe("AdminMatchesPage", () => {
  it("never offers a banned team", () => {
    // TC-UI-260 バックエンドも TEAM-006 で弾くが、選ばせない。
    candidates = [...candidates, team({ teamId: "team-x", teamName: "バン済み", isBanned: true })];
    render(<AdminMatchesPage />);

    expect(screen.queryByRole("option", { name: /バン済み/ })).toBeNull();
  });

  it("never offers a team with no members", () => {
    // TC-UI-261 ★誰も結果を報告できず、報告期限まで相手を拘束する（TEAM-011）。
    candidates = [...candidates, team({ teamId: "team-y", teamName: "空チーム", memberCount: 0 })];
    render(<AdminMatchesPage />);

    expect(screen.queryByRole("option", { name: /空チーム/ })).toBeNull();
  });

  it("shows the member count on every candidate", () => {
    // TC-UI-262 ★必須人数を要求しない以上、人数は画面でしか分からない（ADR-039 ④）。
    render(<AdminMatchesPage />);

    expect(
      screen.getAllByRole("option", { name: /アルファ（レート 1500 \/ 3人）/ }).length,
    ).toBeGreaterThan(0);
  });

  it("warns when the rosters are uneven but still allows the pairing", async () => {
    // TC-UI-263 ★止めない。知らせる。
    candidates = [team(), team({ teamId: "team-b", teamName: "ブラボー", memberCount: 1 })];
    render(<AdminMatchesPage />);

    await pick("チーム A", "アルファ");
    await pick("チーム B", "ブラボー");

    expect(screen.getByRole("status")).toHaveTextContent(/人数が揃っていません/);
    expect(screen.getByRole("button", { name: "内容を確認する" })).toBeEnabled();
  });

  it("never lets the same team face itself", async () => {
    // TC-UI-264 相手側の選択肢から除く。DBにも制約がある。
    render(<AdminMatchesPage />);
    await pick("チーム A", "アルファ");

    const teamB = screen.getByLabelText("チーム B");
    expect(within(teamB).queryByRole("option", { name: /アルファ/ })).toBeNull();
  });

  it("requires a confirmation before creating the match", async () => {
    // TC-UI-265 ★取り消せない操作である。確認を挟まずに送ってはならない。
    render(<AdminMatchesPage />);
    await pick("チーム A", "アルファ");
    await pick("チーム B", "ブラボー");

    await userEvent.click(screen.getByRole("button", { name: "内容を確認する" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/取り消せません/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "この組み合わせで用意する" }));
    expect(mutate).toHaveBeenCalledWith(
      { teamAId: "team-a", teamBId: "team-b" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("offers no way to skip the confirmation", async () => {
    // TC-UI-266 ★「次回から表示しない」を設けてはならない（ADR-032 ① と同じ考え）。
    render(<AdminMatchesPage />);
    await pick("チーム A", "アルファ");
    await pick("チーム B", "ブラボー");
    await userEvent.click(screen.getByRole("button", { name: "内容を確認する" }));

    expect(screen.queryByText(/次回から/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
