import { describe, it, expect } from "vitest";
import { errorMessage } from "./errorMessage";

// エラーコード → 表示文言の変換（05_Frontend.md 12章 / 06_ErrorCode.md）。
describe("errorMessage", () => {
  it("returns the message defined for a known error code", () => {
    // TC-UI-101
    expect(errorMessage("TEAM-003")).toBe("既にチームへ所属しています");
    expect(errorMessage("AUTH-001")).toBe("認証が必要です");
    expect(errorMessage("VALIDATION-003")).toBe("入力値が範囲外です");
  });

  it("falls back to a generic message for an unknown code", () => {
    // TC-UI-102
    expect(errorMessage("NOT-A-REAL-CODE")).toBe("予期しないエラーが発生しました");
  });

  it("falls back to a generic message when the code is missing", () => {
    // TC-UI-103
    expect(errorMessage(undefined)).toBe("予期しないエラーが発生しました");
  });
});
