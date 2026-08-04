import { assertEquals, assertRejects } from "jsr:@std/assert";
import { handler, setDbPool, resetDbPool, setJwtVerifier, resetJwtVerifier } from "../supabase/functions/create-team/index.ts";

Deno.test("正常なチーム作成が成功すること", async () => {
  // モックのセットアップ
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const mockPool = {
    connect: () => Promise.resolve({
      queryObject: (sql: string) => {
        if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
          return Promise.resolve({ rows: [] }); // 所属していないことを示す
        }
        if (sql.includes("SELECT initial_rating FROM system_settings LIMIT 1")) {
          return Promise.resolve({ rows: [{ initial_rating: 1200 }] });
        }
        if (sql.includes("INSERT INTO teams (name, rating) VALUES ($1, $2) RETURNING id, name, rating")) {
          return Promise.resolve({ rows: [{ id: "team-1", name: "Test Team", rating: 1200 }] });
        }
        if (sql.includes("INSERT INTO team_members (team_id, profile_id, role) VALUES ($1, $2, 'LEADER')")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("INSERT INTO audit_logs (action, team_id, profile_id) VALUES ('TEAM_CREATED', $1, $2)")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK 用
      },
      release: () => {}
    })
  };

  setDbPool(mockPool);

  try {
    const url = "http://localhost:8000";
    const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
    const body = JSON.stringify({ name: "Test Team" });
    const res = await handler(new Request(url, { method: "POST", headers, body }));

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.result, "OK");
    assertEquals(data.data.teamId, "team-1");
    assertEquals(data.data.name, "Test Team");
    assertEquals(data.data.rating, 1200);
  } finally {
    resetJwtVerifier();
    resetDbPool();
  }
});

Deno.test("認証なしでチーム作成が失敗すること", async () => {
  setJwtVerifier(async () => null); // 認証失敗

  const url = "http://localhost:8000";
  const headers = { "Content-Type": "application/json" };
  const body = JSON.stringify({ name: "Test Team" });
  const res = await handler(new Request(url, { method: "POST", headers, body }));

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "AUTH-001");
});

Deno.test("認証ヘッダがBearerでない場合、認証失敗すること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } })); // 検証成功

  const url = "http://localhost:8000";
  const headers = { "Authorization": "InvalidToken", "Content-Type": "application/json" };
  const body = JSON.stringify({ name: "Test Team" });
  const res = await handler(new Request(url, { method: "POST", headers, body }));

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "AUTH-001");
});

Deno.test("チーム名が不正な場合、バリデーションエラーになること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const url = "http://localhost:8000";
  const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
  const body = JSON.stringify({ name: 123 }); // 文字列でない
  const res = await handler(new Request(url, { method: "POST", headers, body }));

  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "VALIDATION-001");
});

Deno.test("チーム名が範囲外（空文字）の場合、バリデーションエラーになること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const url = "http://localhost:8000";
  const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
  const body = JSON.stringify({ name: "" }); // 空文字
  const res = await handler(new Request(url, { method: "POST", headers, body }));

  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "VALIDATION-003");
});

Deno.test("チーム名が範囲外（31文字以上）の場合、バリデーションエラーになること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const url = "http://localhost:8000";
  const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
  const body = JSON.stringify({ name: "a".repeat(31) }); // 31文字
  const res = await handler(new Request(url, { method: "POST", headers, body }));

  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "VALIDATION-003");
});

Deno.test("既にチームに所属している場合、チーム作成不可エラーになること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const mockPool = {
    connect: () => Promise.resolve({
      queryObject: (sql: string) => {
        if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
          return Promise.resolve({ rows: [{ id: "existing-id" }] }); // 所属していることを示す
        }
        return Promise.resolve({ rows: [] });
      },
      release: () => {}
    })
  };

  setDbPool(mockPool);

  try {
    const url = "http://localhost:8000";
    const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
    const body = JSON.stringify({ name: "Test Team" });
    const res = await handler(new Request(url, { method: "POST", headers, body }));

    assertEquals(res.status, 409);
    const data = await res.json();
    assertEquals(data.result, "NG");
    assertEquals(data.error.code, "TEAM-003");
  } finally {
    resetJwtVerifier();
    resetDbPool();
  }
});

Deno.test("system_settingsに初期レートが存在しない場合、システムエラーになること", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));

  const mockPool = {
    connect: () => Promise.resolve({
      queryObject: (sql: string) => {
        if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("SELECT initial_rating FROM system_settings LIMIT 1")) {
          return Promise.resolve({ rows: [] }); // 初期レートなし
        }
        return Promise.resolve({ rows: [] });
      },
      release: () => {}
    })
  };

  setDbPool(mockPool);

  try {
    const url = "http://localhost:8000";
    const headers = { "Authorization": "Bearer test-token", "Content-Type": "application/json" };
    const body = JSON.stringify({ name: "Test Team" });
    const res = await handler(new Request(url, { method: "POST", headers, body }));

    assertEquals(res.status, 500);
    const data = await res.json();
    assertEquals(data.result, "FATAL");
    assertEquals(data.error.code, "SYSTEM-001");
  } finally {
    resetJwtVerifier();
    resetDbPool();
  }
});