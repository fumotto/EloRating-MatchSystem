// レート変動予測の検証（Issue #5）。
//
// ★表示と実際の確定値がずれないことを守る。ずれると利用者の不信につながる。
import { describe, it, expect } from "vitest";
import { projectRatingChange } from "./ratingProjection";
import { calculateRating } from "../../supabase/functions/_shared/rating.ts";

describe("projectRatingChange", () => {
  it("matches what the backend will actually apply", () => {
    // 予測は確定処理と同じ関数を通す。ここが崩れると表示と結果が食い違う。
    const actual = calculateRating(1500, 1600, 32);
    const projected = projectRatingChange(1500, 1600, 32);
    expect(projected.win).toBe(actual.winnerChange);
  });

  it("gives more points for beating a stronger team", () => {
    const vsStronger = projectRatingChange(1500, 1900, 32);
    const vsWeaker = projectRatingChange(1500, 1100, 32);
    expect(vsStronger.win).toBeGreaterThan(vsWeaker.win);
  });

  it("costs more for losing to a weaker team", () => {
    const vsStronger = projectRatingChange(1500, 1900, 32);
    const vsWeaker = projectRatingChange(1500, 1100, 32);
    expect(vsWeaker.lose).toBeGreaterThan(vsStronger.lose);
  });

  it("returns the loss as a positive magnitude", () => {
    const p = projectRatingChange(1500, 1500, 32);
    expect(p.lose).toBeGreaterThan(0);
  });

  it("moves about half of K for an even match", () => {
    // 互角なら期待勝率0.5、変動は K/2 になる。
    const p = projectRatingChange(1500, 1500, 32);
    expect(p.win).toBe(16);
    expect(p.lose).toBe(16);
  });

  it("reflects the configured K factor", () => {
    expect(projectRatingChange(1500, 1500, 48).win).toBe(24);
  });

  it("caps the loss at the rating lower bound", () => {
    // 下限に達しているチームは、負けても下限までしか減らない（08 6章）。
    const p = projectRatingChange(100, 1500, 32);
    expect(p.lose).toBe(0);
  });
});
