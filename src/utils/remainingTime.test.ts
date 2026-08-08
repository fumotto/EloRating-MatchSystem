import { describe, it, expect } from "vitest";
import { remainingTime } from "./remainingTime";
import { apiErrorCode } from "./apiErrorCode";
import { ApiError } from "../services/invoke";
import { matchStatusLabel } from "../features/match/components/matchStatusLabel";

// 現在時刻に依存させないため、基準時刻を引数で渡せるようにしてある。
const NOW = new Date("2026-08-08T10:00:00Z").getTime();
const at = (iso: string) => remainingTime(iso, NOW);

describe("remainingTime", () => {
  it("shows the remaining time until the report deadline", () => {
    // TC-UI-030 / TC-UI-033
    expect(at("2026-08-08T10:30:00Z")).toBe("残り約30分");
    expect(at("2026-08-08T13:00:00Z")).toBe("残り約3時間");
    expect(at("2026-08-10T10:00:00Z")).toBe("残り約2日");
  });

  it("tells the user that an expired match is resolved automatically", () => {
    // 期限を過ぎた試合は自動解決される（14.7）。単に「0分」と出しても意味が伝わらない。
    expect(at("2026-08-08T09:59:00Z")).toBe("期限切れ（まもなく自動処理されます）");
    // 期限ちょうども期限切れとして扱う。
    expect(at("2026-08-08T10:00:00Z")).toBe("期限切れ（まもなく自動処理されます）");
  });

  it("never shows zero minutes while time remains", () => {
    // 30秒後は「残り約0分」ではなく「残り約1分」とする。
    expect(at("2026-08-08T10:00:30Z")).toBe("残り約1分");
  });

  it("renders a placeholder when there is no deadline", () => {
    // approve_deadline_at は PLAYING の間 NULL である。
    expect(remainingTime(null, NOW)).toBe("—");
  });
});

describe("apiErrorCode", () => {
  it("extracts the error code from an ApiError", () => {
    expect(apiErrorCode(new ApiError("MATCH-008"))).toBe("MATCH-008");
  });

  it("falls back to SYSTEM-001 for unknown failures", () => {
    // 通信層の失敗などコードを持たないもの。画面はコードから文言を引く（12.2）。
    expect(apiErrorCode(new Error("network down"))).toBe("SYSTEM-001");
  });

  it("returns undefined when there is no error", () => {
    expect(apiErrorCode(undefined)).toBeUndefined();
    expect(apiErrorCode(null)).toBeUndefined();
  });
});

describe("matchStatusLabel", () => {
  it("labels the four match states", () => {
    // 状態は4つだけである。MATCHED・IN_PROGRESS は存在しない（ADR-008）。
    expect(matchStatusLabel("PLAYING")).toBe("進行中");
    expect(matchStatusLabel("WINNER_REPORTED")).toBe("承認待ち");
    expect(matchStatusLabel("COMPLETED")).toBe("確定");
    expect(matchStatusLabel("DRAWN")).toBe("引き分け");
  });
});
