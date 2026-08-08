import { describe, it, expect } from "vitest";
import {
  pairTeams,
  selectOpponent,
  type QueuedTeam,
} from "../../supabase/functions/_shared/matchmaking.ts";

// 優先順位（09 6.2）と許容レート差（6.3）の判定は純粋関数として切り出してある。
// Part4 の表は種別を Integration としているが、判定そのものはDBに依存しないため
// ここで直接検証する。SQL側の絞り込み（BAN・試合中の除外）は Integration で検証する。

const team = (id: string, rating: number, queuedAt: string): QueuedTeam => ({
  team_id: id,
  rating,
  queued_at: queuedAt,
});

const T0 = "2026-08-08T10:00:00Z";
const T1 = "2026-08-08T10:01:00Z";
const T2 = "2026-08-08T10:02:00Z";

describe("_shared/matchmaking — レート差", () => {
  it("matches two teams within the rating range", () => {
    // TC-QUEUE-014
    const a = team("a", 1500, T0);
    const b = team("b", 1700, T1);
    expect(pairTeams([a, b], 400)).toEqual([[a, b]]);
  });

  it("does not match teams beyond the rating range", () => {
    // TC-QUEUE-015 / TC-QUEUE-017 差401は成立しない
    const a = team("a", 1500, T0);
    const b = team("b", 1901, T1);
    expect(pairTeams([a, b], 400)).toEqual([]);
    expect(selectOpponent(a, [b], 400)).toBeNull();
  });

  it("matches teams exactly at the rating range boundary", () => {
    // TC-QUEUE-016 境界値は含む（6.3）
    const a = team("a", 1500, T0);
    const e = team("e", 1900, T1);
    expect(pairTeams([a, e], 400)).toEqual([[a, e]]);
  });

  it("reads the rating range from system settings", () => {
    // TC-QUEUE-022 許容差200なら差300は成立しない。ハードコードしていれば通らない。
    const a = team("a", 1500, T0);
    const b = team("b", 1800, T1);
    expect(pairTeams([a, b], 400)).toHaveLength(1);
    expect(pairTeams([a, b], 200)).toHaveLength(0);
  });
});

describe("_shared/matchmaking — 優先順位", () => {
  it("prefers the opponent with the smallest rating gap", () => {
    // TC-QUEUE-018
    const me = team("me", 1500, T0);
    const near = team("near", 1550, T2);
    const far = team("far", 1800, T1);
    expect(selectOpponent(me, [far, near], 400)?.team_id).toBe("near");
  });

  it("prioritises rating gap over waiting time", () => {
    // TC-QUEUE-019 ★ここが要。待機時間で先に並べると far が選ばれてしまう。
    const me = team("me", 1500, T0);
    const oldFar = team("old-far", 1850, T0);
    const newNear = team("new-near", 1510, T2);
    expect(selectOpponent(me, [oldFar, newNear], 400)?.team_id).toBe("new-near");
  });

  it("prefers the longest waiting opponent on equal gaps", () => {
    // TC-QUEUE-020 第2優先
    const me = team("me", 1500, T1);
    const early = team("early", 1600, T0);
    const late = team("late", 1600, T2);
    expect(selectOpponent(me, [late, early], 400)?.team_id).toBe("early");
  });

  it("breaks ties by team id", () => {
    // TC-QUEUE-021 第3優先。同条件でも実行ごとに結果が変わってはならない。
    const me = team("me", 1500, T1);
    const bbb = team("bbb", 1600, T0);
    const aaa = team("aaa", 1600, T0);
    expect(selectOpponent(me, [bbb, aaa], 400)?.team_id).toBe("aaa");
    expect(selectOpponent(me, [aaa, bbb], 400)?.team_id).toBe("aaa");
  });
});

describe("_shared/matchmaking — 組み合わせ", () => {
  it("never matches a team against itself", () => {
    // TC-QUEUE-025
    const a = team("a", 1500, T0);
    expect(pairTeams([a], 400)).toEqual([]);
    expect(selectOpponent(a, [a], 400)).toBeNull();
  });

  it("leaves one team queued when the count is odd", () => {
    // TC-QUEUE-026
    const a = team("a", 1500, T0);
    const b = team("b", 1520, T1);
    const c = team("c", 1540, T2);

    const pairs = pairTeams([a, b, c], 400);
    expect(pairs).toHaveLength(1);

    const paired = pairs.flat().map((t) => t.team_id);
    expect(paired).toHaveLength(2);
    // 待機が最も長い a は必ず組まれる。余るのは1チームだけである。
    expect(paired).toContain("a");
  });

  it("creates multiple matches in one run", () => {
    // TC-QUEUE-027
    const teams = [
      team("a", 1500, T0),
      team("b", 1510, T0),
      team("c", 1520, T1),
      team("d", 1530, T1),
    ];

    const pairs = pairTeams(teams, 400);
    expect(pairs).toHaveLength(2);
    // 同一チームが2つの組に現れてはならない（TC-QUEUE-037 の前提）。
    expect(new Set(pairs.flat().map((t) => t.team_id)).size).toBe(4);
  });

  it("leaves teams queued when nobody is in range", () => {
    // 相手が見つからないのはエラーではない。待機を継続させる。
    const teams = [team("a", 1500, T0), team("b", 2500, T1), team("c", 3500, T2)];
    expect(pairTeams(teams, 400)).toEqual([]);
  });
});
