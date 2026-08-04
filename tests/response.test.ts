import { assertEquals } from "jsr:@std/assert";
import { ok, businessError, systemError } from "../supabase/functions/_shared/response.ts";

Deno.test("ok関数はOK結果とデータを200で返す", async () => {
  const testData = { id: 1, name: "test" };
  const res = ok(testData);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");

  const body = await res.json();
  assertEquals(body.result, "OK");
  assertEquals(body.data, testData);
  assertEquals(body.error, undefined);
});

Deno.test("businessError関数はNG結果と渡されたHTTPステータスを返す", async () => {
  const res = businessError("TEAM-004", "Team is full.", 409);

  // ★statusを引数で受けながら捨てていると、ここが200になる。
  //   HTTPステータスは本文に無く、Responseでしか運べない（06_ErrorCode.md 3章）。
  assertEquals(res.status, 409);

  const body = await res.json();
  assertEquals(body.result, "NG");
  assertEquals(body.error?.code, "TEAM-004");
  assertEquals(body.error?.message, "Team is full.");
});

Deno.test("businessError関数は認証・権限エラーのステータスもそのまま反映する", async () => {
  assertEquals(businessError("AUTH-001", "認証が必要です", 401).status, 401);
  assertEquals(businessError("TEAM-005", "チームリーダーのみ実行できます", 403).status, 403);
  assertEquals(businessError("PROFILE-001", "プロフィールが存在しません", 404).status, 404);
});

Deno.test("systemError関数はFATAL結果を500で返す", async () => {
  const res = systemError("SYSTEM-001", "Internal server error.");

  assertEquals(res.status, 500);

  const body = await res.json();
  assertEquals(body.result, "FATAL");
  assertEquals(body.error?.code, "SYSTEM-001");
  assertEquals(body.error?.message, "Internal server error.");
});
