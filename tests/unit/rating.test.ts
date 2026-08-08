import { describe, it, expect } from "vitest";
import {
  calculateRating,
  expectedScore,
  round,
  RATING_LOWER_BOUND,
} from "../../supabase/functions/_shared/rating.ts";

// Eloレート計算は純粋関数のため Unit（Vitest）で検証する（ADR-016 / Part2 1章）。
// ★期待値は 10_TestSpecification_Part2_Rating.md 2章の固定値である。
//   テストコード内で計算式を再実装してはならない（Part1 10.1）。

describe("_shared/rating — Elo計算", () => {
  it("calculates +16/-16 when both teams have equal rating", () => {
    // TC-RATING-001
    const r = calculateRating(1500, 1500, 32);
    expect(r.winnerAfter).toBe(1516);
    expect(r.loserAfter).toBe(1484);
  });

  it("gives a large gain when the underdog wins", () => {
    // TC-RATING-002
    const r = calculateRating(1500, 1900, 32);
    expect(r.winnerAfter).toBe(1529);
    expect(r.loserAfter).toBe(1871);
  });

  it("gives a small gain when the favorite wins", () => {
    // TC-RATING-003
    const r = calculateRating(1900, 1500, 32);
    expect(r.winnerAfter).toBe(1903);
    expect(r.loserAfter).toBe(1497);
  });

  it("caps the gain at K for an extreme upset", () => {
    // TC-RATING-004
    const r = calculateRating(1000, 2500, 32);
    expect(r.winnerAfter).toBe(1032);
    expect(r.loserAfter).toBe(2468);
    expect(r.delta).toBe(32);
  });

  it("produces no change when the win is fully expected", () => {
    // TC-RATING-005
    const r = calculateRating(2500, 1000, 32);
    expect(r.winnerAfter).toBe(2500);
    expect(r.loserAfter).toBe(1000);
    expect(r.delta).toBe(0);
  });

  it("computes the expected score from the rating difference", () => {
    // TC-RATING-006 レート差400（相手が400高い）
    expect(expectedScore(1500, 1900)).toBeCloseTo(0.09091, 5);
  });

  it("scales the delta with the configured K factor", () => {
    // TC-RATING-007
    const r = calculateRating(1500, 1500, 64);
    expect(r.winnerAfter).toBe(1532);
    expect(r.loserAfter).toBe(1468);
    expect(r.kValue).toBe(64);
  });

  it("applies the minimum K factor", () => {
    // TC-RATING-008 K値の有効範囲は 1〜128（03_Database.md の CHECK制約）
    const r = calculateRating(1500, 1500, 1);
    expect(r.winnerAfter).toBe(1501);
    expect(r.loserAfter).toBe(1499);
  });

  it("applies the maximum K factor", () => {
    // TC-RATING-009
    const r = calculateRating(1500, 1500, 128);
    expect(r.winnerAfter).toBe(1564);
    expect(r.loserAfter).toBe(1436);
  });
});

describe("_shared/rating — 丸め処理", () => {
  it("rounds down below the half", () => {
    // TC-RATING-010
    expect(round(15.4)).toBe(15);
  });

  it("rounds half up", () => {
    // TC-RATING-011
    expect(round(15.5)).toBe(16);
  });

  it("rounds up above the half", () => {
    // TC-RATING-012
    expect(round(15.6)).toBe(16);
  });

  it("rounds negative halves toward positive infinity", () => {
    // TC-RATING-013
    expect(round(-15.5)).toBe(-15);
  });
});

describe("_shared/rating — ゼロサム性", () => {
  it("keeps the total rating constant for a single match", () => {
    // TC-RATING-014 クランプが発生しない範囲では総和が保存される
    const pairs: Array<[number, number]> = [
      [1500, 1500],
      [1500, 1900],
      [1900, 1500],
      [1100, 1800],
      [2500, 1000],
    ];

    for (const [winner, loser] of pairs) {
      const r = calculateRating(winner, loser, 32);
      // 変動量0の試合で -0 と +0 を区別しないよう 0 を加算して正規化する。
      expect(r.winnerChange).toBe(-r.loserChange + 0);
      expect(r.winnerAfter + r.loserAfter).toBe(r.winnerBefore + r.loserBefore);
    }
  });

  it("does not drift the total rating when both deltas are .5", () => {
    // TC-RATING-015
    // ★両者を独立に四捨五入すると +16 / -15 となり合計が +1 漂流する（08 5.2）。
    //   敗者へは符号反転値を適用しなければならない。
    const r = calculateRating(1500, 1500, 32);
    expect(r.winnerChange).toBe(16);
    expect(r.loserChange).toBe(-16);
    expect(r.winnerChange + r.loserChange).toBe(0);
  });
});

describe("_shared/rating — レート下限クランプ", () => {
  it("clamps the loser rating at the lower bound of 100", () => {
    // TC-RATING-016 敗者105・勝者100、K=32 → 敗者は 89 ではなく 100 で停止する
    const r = calculateRating(100, 105, 32);
    expect(r.loserAfter).toBe(RATING_LOWER_BOUND);
  });

  it("records the actual change after clamping", () => {
    // TC-RATING-017 rating_history.rating_change はクランプ後の実差（08 6章）
    const r = calculateRating(100, 105, 32);
    expect(r.loserChange).toBe(-5);
    // クランプ時はゼロサム性より制約充足を優先する。両者の絶対値は一致しない。
    expect(r.winnerChange).not.toBe(-r.loserChange);
  });

  it("keeps the rating at the bound when already clamped", () => {
    // TC-RATING-018
    const r = calculateRating(100, 100, 32);
    expect(r.loserAfter).toBe(RATING_LOWER_BOUND);
    expect(r.loserChange).toBe(0);
  });
});
