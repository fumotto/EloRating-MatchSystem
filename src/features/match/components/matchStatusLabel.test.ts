// DRAWN の理由別表示（TC-UI-209 / TC-UI-210 / ADR-034 ①）。
//
// ★`DRAWN` を一律に「引き分け」と表示してはならない。帰結が異なる。
import { describe, it, expect } from "vitest";
import { noContestLabel, noContestReasonLabel } from "./matchStatusLabel";
import type { NoContestReason } from "../../../types/api";

const ALL: NoContestReason[] = ["REPORT_TIMEOUT", "NO_SHOW", "MUTUAL", "CONFLICT", "ADMIN_VOID"];

describe("noContestLabel", () => {
  it("renders a distinct explanation per no-contest reason", () => {
    // TC-UI-209 5種すべてが異なる文言であること
    const labels = ALL.map(noContestLabel);
    expect(new Set(labels).size).toBe(ALL.length);
  });

  it("states that a mutual no-contest has no penalty", () => {
    // TC-UI-210 同意による不成立は不利益が無い
    expect(noContestLabel("MUTUAL")).toMatch(/記録に影響せず/);
    expect(noContestLabel("ADMIN_VOID")).toMatch(/不利益はありません/);
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
