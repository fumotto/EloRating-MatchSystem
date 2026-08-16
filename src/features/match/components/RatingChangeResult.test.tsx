// 確定時のレート変動表示（Issue #6）。
//
// ★勝敗・引き分け・下限到達で表示が変わる。いずれも利用者が結果を
//   誤解しないための分岐であり、テストで固定する。
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingChangeResult } from "./RatingChangeResult";
import type { MatchRatingResult } from "../../../types/api";

const win: MatchRatingResult = {
  teamId: "team-1",
  beforeRating: 1500,
  afterRating: 1516,
  ratingChange: 16,
  result: "WIN",
};

const lose: MatchRatingResult = {
  teamId: "team-2",
  beforeRating: 1500,
  afterRating: 1484,
  ratingChange: -16,
  result: "LOSE",
};

describe("RatingChangeResult", () => {
  it("shows the win result for my team", () => {
    render(<RatingChangeResult results={[win, lose]} myTeamId="team-1" isDrawn={false} />);
    expect(screen.getByText("勝利")).toBeInTheDocument();
    expect(screen.getByText("1500 → 1516")).toBeInTheDocument();
  });

  it("shows the loss result for my team", () => {
    render(<RatingChangeResult results={[win, lose]} myTeamId="team-2" isDrawn={false} />);
    expect(screen.getByText("敗北")).toBeInTheDocument();
    expect(screen.getByText("1500 → 1484")).toBeInTheDocument();
  });

  it("states explicitly that a draw does not move the rating", () => {
    // ★何も出さないと「更新されていない」のか「引き分けだった」のか区別できない。
    render(<RatingChangeResult results={[]} myTeamId="team-1" isDrawn={true} />);
    expect(screen.getByText(/引き分けのため、レートは変動していません/)).toBeInTheDocument();
  });

  it("renders nothing when my team is not a participant", () => {
    const { container } = render(
      <RatingChangeResult results={[win, lose]} myTeamId="team-9" isDrawn={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing before the match is settled", () => {
    const { container } = render(
      <RatingChangeResult results={[]} myTeamId="team-1" isDrawn={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("explains the lower bound when the rating stops at it", () => {
    // ★下限で止まると減少量が相手の増加量と一致しない（08 6章）。
    //   説明が無いと「計算が合っていない」と受け取られる。
    const bounded: MatchRatingResult = {
      teamId: "team-3",
      beforeRating: 110,
      afterRating: 100,
      ratingChange: -10,
      result: "LOSE",
    };
    render(<RatingChangeResult results={[bounded]} myTeamId="team-3" isDrawn={false} />);
    expect(screen.getByText(/下限/)).toBeInTheDocument();
  });

  it("does not mention the lower bound on a normal loss", () => {
    render(<RatingChangeResult results={[lose]} myTeamId="team-2" isDrawn={false} />);
    expect(screen.queryByText(/下限/)).not.toBeInTheDocument();
  });
});
