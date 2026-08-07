import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
} from "../../supabase/functions/ensure-profile/index.ts";

const URL_ENSURE_PROFILE = "http://localhost/ensure-profile";

// MVPの認証プロバイダは Discord（ADR-022）。
// provider_user_id は auth.uid() ではなく user_metadata.provider_id から取る（ADR-015 / B-009）。
const authenticatedVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

describe("ensure-profile", () => {
  it("rejects an unauthenticated call", async () => {
    // TC-SEC-001
    const res = await handler(new Request(URL_ENSURE_PROFILE, { method: "POST" }));
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.result, "NG");
    assertEquals(data.error.code, "AUTH-001");
  });

  it("rejects a call whose token fails verification", async () => {
    // TC-SEC-001
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: "test",
            avatarUrl: "https://example.com/avatar.png",
          }),
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

  it("rejects an empty display name", async () => {
    // TC-TEAM-006
    setJwtVerifier(authenticatedVerifier);
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: "",
            avatarUrl: "https://example.com/avatar.png",
          }),
        }),
      );
      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a display name longer than 50 characters", async () => {
    // TC-TEAM-006
    setJwtVerifier(authenticatedVerifier);
    try {
      const displayName = "a".repeat(51);
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName,
            avatarUrl: "https://example.com/avatar.png",
          }),
        }),
      );
      assertEquals(res.status, 400);
      const data = await res.json();
      assertEquals(data.result, "NG");
      assertEquals(data.error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("creates a profile on first login", async () => {
    // TC-TEAM-001
    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string) => {
            if (sql.includes("SELECT")) return Promise.resolve({ rows: [] }); // プロフィールなし
            if (sql.includes("INSERT")) {
              return Promise.resolve({
                rows: [{
                  id: "profile-1",
                  display_name: "TestUser",
                  avatar_url: null,
                  auth_provider: "discord",
                }],
              });
            }
            return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK はここに来る
          },
          release: () => {},
        }),
    };
    setDbPool(mockPool as never);
    setJwtVerifier(authenticatedVerifier);
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ displayName: "TestUser" }),
        }),
      );
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.id, "profile-1");
      assertEquals(data.data.displayName, "TestUser");
      assertEquals(data.data.authProvider, "discord");
    } finally {
      resetDbPool();
      resetJwtVerifier();
    }
  });

  it("derives the provider and provider user id from the JWT, not the request body", async () => {
    // TC-TEAM-005
    // provider_user_id に auth.uid() を入れると UNIQUE (auth_provider, provider_user_id) が
    // 常に一意となり、ADR-015 の識別が意味を失う（B-009）。
    const executed: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string, params: unknown[] = []) => {
            executed.push({ sql, params });
            if (sql.includes("SELECT")) return Promise.resolve({ rows: [] });
            if (sql.includes("INSERT")) {
              return Promise.resolve({
                rows: [{
                  id: "profile-1",
                  display_name: "TestUser",
                  avatar_url: null,
                  auth_provider: "discord",
                }],
              });
            }
            return Promise.resolve({ rows: [] });
          },
          release: () => {},
        }),
    };
    setDbPool(mockPool as never);
    setJwtVerifier(authenticatedVerifier);
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          // ボディのプロバイダ情報は無視されること。
          body: JSON.stringify({
            displayName: "TestUser",
            authProvider: "steam",
            providerUserId: "spoofed",
          }),
        }),
      );
      assertEquals(res.status, 200);

      const insert = executed.find((q) => q.sql.includes("INSERT INTO profiles"));
      if (!insert) throw new Error("profiles への INSERT が発行されていない");

      // [id, auth_provider, provider_user_id, display_name, avatar_url]
      assertEquals(insert.params[0], "profile-1"); // auth.uid()
      assertEquals(insert.params[1], "discord"); // JWT の app_metadata.provider
      assertEquals(insert.params[2], "discord-user-1"); // JWT の user_metadata.provider_id
      // provider_user_id が auth.uid() と同じになっていないこと。
      assertEquals(insert.params[2] === insert.params[0], false);
    } finally {
      resetDbPool();
      resetJwtVerifier();
    }
  });

  it("fails with a system error when the JWT carries no provider information", async () => {
    // TC-INFRA-014
    setJwtVerifier(() => Promise.resolve({ sub: "profile-1", app_metadata: {}, user_metadata: {} }));
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ displayName: "TestUser" }),
        }),
      );
      assertEquals(res.status, 500);
      const data = await res.json();
      assertEquals(data.result, "FATAL");
      assertEquals(data.error.code, "SYSTEM-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("syncs the display name from the provider", async () => {
    // TC-TEAM-003
    const mockPool = {
      connect: () =>
        Promise.resolve({
          queryObject: (sql: string) => {
            if (sql.includes("SELECT")) {
              return Promise.resolve({
                rows: [{
                  id: "profile-1",
                  display_name: "OldUser",
                  avatar_url: null,
                  auth_provider: "discord",
                }],
              }); // 既存プロフィール
            }
            if (sql.includes("UPDATE")) {
              return Promise.resolve({
                rows: [{
                  id: "profile-1",
                  display_name: "NewUser",
                  avatar_url: "https://example.com/avatar.png",
                  auth_provider: "discord",
                }],
              });
            }
            return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK はここに来る
          },
          release: () => {},
        }),
    };
    setDbPool(mockPool as never);
    setJwtVerifier(authenticatedVerifier);
    try {
      const res = await handler(
        new Request(URL_ENSURE_PROFILE, {
          method: "POST",
          headers: {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: "NewUser",
            avatarUrl: "https://example.com/avatar.png",
          }),
        }),
      );
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.id, "profile-1");
      assertEquals(data.data.displayName, "NewUser");
      assertEquals(data.data.avatarUrl, "https://example.com/avatar.png");
    } finally {
      resetDbPool();
      resetJwtVerifier();
    }
  });
});
