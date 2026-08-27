// DRAWN の理由別表示（TC-UI-209 / TC-UI-210 / TC-UI-241 / ADR-034 ① / ADR-038 ①）。
//
// ★`DRAWN` を一律に「引き分け」と表示してはならない。帰結が異なる。
import { describe, it, expect } from "vitest";
import { noContestLabel, noContestReasonLabel } from "./matchStatusLabel";
import type { NoContestReason } from "../../../types/api";

// ★理由を増やしたらここへ足す。足し忘れると、新しい理由だけ文言が検証されない。
const ALL: NoContestReason[] = [
  "REPORT_TIMEOUT",
  "NO_SHOW",
  "MUTUAL",
  "CONFLICT",
  "ADMIN_VOID",
  "SEASON_END",
];

describe("noContestLabel", () => {
  it("renders a distinct explanation per no-contest reason", () => {
    // TC-UI-209 すべてが異なる文言であること
    const labels = ALL.map(noContestLabel);
    expect(new Set(labels).size).toBe(ALL.length);
  });

  it("states that a mutual no-contest has no penalty", () => {
    // TC-UI-210 同意による不成立は不利益が無い
    expect(noContestLabel("MUTUAL")).toMatch(/記録に影響せず/);
    expect(noContestLabel("ADMIN_VOID")).toMatch(/不利益はありません/);
  });

  it("distinguishes a season cutoff from an administrative void", () => {
    // TC-UI-241 ★同じ文言にしない（ADR-038 ①）。管理者が個別に無効化したのではなく、
    //   シーズンの終了に伴って打ち切られた試合である。
    expect(noContestLabel("SEASON_END")).toMatch(/シーズンの終了/);
    expect(noContestLabel("SEASON_END")).toMatch(/不利益はありません/);
    expect(noContestLabel("SEASON_END")).not.toBe(noContestLabel("ADMIN_VOID"));
  });

  it("warns about the waiting period for the blameworthy reasons", () => {
    // 当事者に帰責する3種は待機が生じる。これが「正直が最速」の裏づけになる
    expect(noContestLabel("REPORT_TIMEOUT")).toMatch(/両チーム/);
    expect(noContestLabel("CONFLICT")).toMatch(/両チーム/);
    expect(noContestLabel("NO_SHOW")).toMatch(/応答しなかった側/);
  });

  it("labels every no-contest request reason", () => {
    expect(noContestReasonLabel("CONNECTION")).toBe("回線が合わない");
    expect(noContestReasonLabel("NO_RESPONSE")).toMatch(/応答しない/);
  });
});
