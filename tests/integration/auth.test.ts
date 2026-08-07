import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import {
  verifyJwt,
  setJwtVerifier,
  resetJwtVerifier,
} from "../../supabase/functions/_shared/auth.ts";

// _shared/auth.ts は djwt（https://deno.land/x/djwt）を import するため Deno でのみ実行できる。
// 検証本体の差し替え口は ADR-021 に従い setJwtVerifier / resetJwtVerifier を使う。

// 偽のJWTクレームを返す関数
const mockVerifier = (token: string) => {
  if (token === "valid-token") {
    return Promise.resolve({
      sub: "user123",
      app_metadata: { provider: "discord", role: "member" },
      user_metadata: { provider_id: "discord-user-1" },
    });
  }
  return Promise.resolve(null);
};

describe("_shared/auth", () => {
  it("returns null when the Authorization header is missing", async () => {
    // TC-INFRA-001
    const req = new Request("https://example.com", {
      headers: {},
    });

    const result = await verifyJwt(req);
    assertEquals(result, null);
  });

  it("returns null when the Authorization header is not a Bearer token", async () => {
    // TC-INFRA-002
    const req = new Request("https://example.com", {
      headers: { "Authorization": "Basic abc123" },
    });

    const result = await verifyJwt(req);
    assertEquals(result, null);
  });

  it("returns null when JWT verification fails", async () => {
    // TC-INFRA-003
    setJwtVerifier(mockVerifier);
    try {
      const req = new Request("https://example.com", {
        headers: { "Authorization": "Bearer invalid-token" },
      });

      const result = await verifyJwt(req);
      assertEquals(result, null);
    } finally {
      resetJwtVerifier();
    }
  });

  it("returns the JWT claims for a valid token", async () => {
    // TC-INFRA-004
    setJwtVerifier(mockVerifier);
    try {
      const req = new Request("https://example.com", {
        headers: { "Authorization": "Bearer valid-token" },
      });

      const result = await verifyJwt(req);
      assertEquals(result?.sub, "user123");
      assertEquals(result?.app_metadata?.provider, "discord");
      assertEquals(result?.app_metadata?.role, "member");
      // provider_user_id の出所（ADR-022 / B-009）。
      assertEquals(result?.user_metadata?.provider_id, "discord-user-1");
    } finally {
      resetJwtVerifier();
    }
  });
});
