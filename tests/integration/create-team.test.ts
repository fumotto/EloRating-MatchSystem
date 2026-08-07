import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
} from "../../supabase/functions/create-team/index.ts";

const URL_CREATE_TEAM = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const authenticatedVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

describe("create-team", () => {
  it("creates a team", async () => {
    // TC-TEAM-008
    setJwtVerifier(authenticatedVerifier);

    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string) => {
            if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
              return Promise.resolve({ rows: [] }); // 所属していないことを示す
            }
            if (sql.includes("SELECT initial_rating FROM system_settings LIMIT 1")) {
              return Promise.resolve({ rows: [{ initial_rating: 1200 }] });
            }
            if (
              sql.includes(
                "INSERT INTO teams (name, rating) VALUES ($1, $2) RETURNING id, name, rating",
              )
            ) {
              return Promise.resolve({
                rows: [{ id: "team-1", name: "Test Team", rating: 1200 }],
              });
            }
            return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK 用
          },
          release: () => {},
        }),
    };

    setDbPool(mockPool as never);

    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

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

  it("records team creation in the audit log", async () => {
    // TC-TEAM-017
    // audit_logs の列は actor_profile_id / action / target_type / target_id / payload（ADR-017）。
    // 存在しない列（team_id / profile_id）へ INSERT すると必ず失敗する（B-010）。
    setJwtVerifier(authenticatedVerifier);

    const executed: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string, params: unknown[] = []) => {
            executed.push({ sql, params });
            if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes("SELECT initial_rating FROM system_settings LIMIT 1")) {
              return Promise.resolve({ rows: [{ initial_rating: 1200 }] });
            }
            if (sql.includes("INSERT INTO teams")) {
              return Promise.resolve({
                rows: [{ id: "team-1", name: "Test Team", rating: 1200 }],
              });
            }
            return Promise.resolve({ rows: [] });
          },
          release: () => {},
        }),
    };

    setDbPool(mockPool as never);

    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );
      assertEquals(res.status, 200);

      const auditInsert = executed.find((q) => q.sql.includes("INSERT INTO audit_logs"));
      if (!auditInsert) throw new Error("audit_logs への INSERT が発行されていない");

      // 実在する列のみを使うこと。
      assertStringIncludes(
        auditInsert.sql,
        "(actor_profile_id, action, target_type, target_id)",
      );
      // NOT NULL である target_type を省略してはならない。
      assertStringIncludes(auditInsert.sql, "'TEAM_CREATED'");
      assertStringIncludes(auditInsert.sql, "'TEAM'");
      assertEquals(auditInsert.params, ["profile-1", "team-1"]);

      // 存在しない列 team_id が残っていないこと（actor_profile_id と紛れないよう境界付きで見る）。
      assertEquals(/\bteam_id\b/.test(auditInsert.sql), false);

      // COMMIT まで到達していること（ROLLBACK していない）。
      assertEquals(executed.some((q) => q.sql === "COMMIT"), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an unauthenticated call", async () => {
    // TC-SEC-001
    setJwtVerifier(() => Promise.resolve(null)); // 認証失敗
    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
      );

      assertEquals(res.status, 401);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a non-bearer authorization header", async () => {
    // TC-SEC-061
    setJwtVerifier(authenticatedVerifier); // 検証自体は成功する
    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, {
          method: "POST",
          headers: { "Authorization": "InvalidToken", "Content-Type": "application/json" },
          body,
        }),
      );

      assertEquals(res.status, 401);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a non-string team name", async () => {
    // TC-TEAM-058
    setJwtVerifier(authenticatedVerifier);
    try {
      const body = JSON.stringify({ name: 123 }); // 文字列でない
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects an empty team name", async () => {
    // TC-TEAM-012
    // 長さ違反は VALIDATION-003（入力値が範囲外です）。型の誤りの VALIDATION-001 とは区別する（B-015）。
    setJwtVerifier(authenticatedVerifier);
    try {
      const body = JSON.stringify({ name: "" }); // 空文字
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "VALIDATION-003");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a team name longer than 30 characters", async () => {
    // TC-TEAM-013
    setJwtVerifier(authenticatedVerifier);
    try {
      const body = JSON.stringify({ name: "a".repeat(31) }); // 31文字
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "VALIDATION-003");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects team creation when already in a team", async () => {
    // TC-TEAM-015
    setJwtVerifier(authenticatedVerifier);

    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string) => {
            if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
              return Promise.resolve({ rows: [{ id: "existing-id" }] }); // 所属していることを示す
            }
            return Promise.resolve({ rows: [] });
          },
          release: () => {},
        }),
    };

    setDbPool(mockPool as never);

    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

      assertEquals(res.status, 409);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "TEAM-003");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("fails with a system error when system_settings has no initial rating", async () => {
    // TC-TEAM-010
    setJwtVerifier(authenticatedVerifier);

    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string) => {
            if (sql.includes("SELECT id FROM team_members WHERE profile_id = $1")) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes("SELECT initial_rating FROM system_settings LIMIT 1")) {
              return Promise.resolve({ rows: [] }); // 初期レートなし
            }
            return Promise.resolve({ rows: [] });
          },
          release: () => {},
        }),
    };

    setDbPool(mockPool as never);

    try {
      const body = JSON.stringify({ name: "Test Team" });
      const res = await handler(
        new Request(URL_CREATE_TEAM, { method: "POST", headers: AUTH_HEADERS, body }),
      );

      assertEquals(res.status, 500);
      const data = await res.json();
      assertEquals(data.result, "FATAL");
      assertEquals(data.error.code, "SYSTEM-001");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });
});
