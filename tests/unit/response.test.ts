import { describe, it, expect } from "vitest";
import { ok, businessError, systemError } from "../../supabase/functions/_shared/response.ts";

// _shared/response.ts は外部依存を持たない純ロジックのため Unit（Vitest）で検証する。
// 10_TestSpecification.md 3章 / 6章（TC-INFRA）。
describe("_shared/response", () => {
  it("returns the payload with result OK and status 200", async () => {
    // TC-INFRA-009
    const testData = { id: 1, name: "test" };
    const res = ok(testData);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");

    const body = await res.json();
    expect(body.result).toBe("OK");
    expect(body.data).toEqual(testData);
    expect(body.error).toBeUndefined();
  });

  it("returns result NG with the given HTTP status", async () => {
    // TC-INFRA-010
    // ★statusを引数で受けながら捨てていると、ここが200になる。
    //   HTTPステータスは本文に無く、Responseでしか運べない（06_ErrorCode.md 3章）。
    const res = businessError("TEAM-004", "Team is full.", 409);

    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.result).toBe("NG");
    expect(body.error?.code).toBe("TEAM-004");
    expect(body.error?.message).toBe("Team is full.");
  });

  it("reflects authentication and authorization statuses as given", () => {
    // TC-INFRA-011
    expect(businessError("AUTH-001", "認証が必要です", 401).status).toBe(401);
    expect(businessError("TEAM-005", "チームリーダーのみ実行できます", 403).status).toBe(403);
    expect(businessError("PROFILE-001", "プロフィールが存在しません", 404).status).toBe(404);
  });

  it("returns result FATAL with status 500", async () => {
    // TC-INFRA-012
    const res = systemError("SYSTEM-001", "Internal server error.");

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.result).toBe("FATAL");
    expect(body.error?.code).toBe("SYSTEM-001");
    expect(body.error?.message).toBe("Internal server error.");
  });
});
