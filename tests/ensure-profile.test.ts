import { assertEquals, assertRejects } from "jsr:@std/assert";
import { handler, setDbPool, resetDbPool, setJwtVerifier, resetJwtVerifier } from "../supabase/functions/ensure-profile/index.ts";

Deno.test("認証なしでアクセスすると401が返る", async () => {
  const url = "http://localhost/ensure-profile";
  const res = await handler(new Request(url, { method: "POST" }));
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.result, "NG");
  assertEquals(data.error.code, "AUTH-001");
});

Deno.test("認証失敗でアクセスすると401が返る", async () => {
  setJwtVerifier(async () => null);
  try {
    const url = "http://localhost/ensure-profile";
    const res = await handler(new Request(url, { 
      method: "POST", 
      headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "test", avatarUrl: "https://example.com/avatar.png" })
    }));
    assertEquals(res.status, 401);
    const data = await res.json();
    assertEquals(data.result, "NG");
    assertEquals(data.error.code, "AUTH-001");
  } finally {
    resetJwtVerifier();
  }
});

Deno.test("表示名が空文字の場合、400が返る", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));
  try {
    const url = "http://localhost/ensure-profile";
    const res = await handler(new Request(url, { 
      method: "POST", 
      headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "", avatarUrl: "https://example.com/avatar.png" })
    }));
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.result, "NG");
    assertEquals(data.error.code, "VALIDATION-001");
  } finally {
    resetJwtVerifier();
  }
});

Deno.test("表示名が51文字以上の場合、400が返る", async () => {
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));
  try {
    const url = "http://localhost/ensure-profile";
    const displayName = "a".repeat(51);
    const res = await handler(new Request(url, { 
      method: "POST", 
      headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, avatarUrl: "https://example.com/avatar.png" })
    }));
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.result, "NG");
    assertEquals(data.error.code, "VALIDATION-001");
  } finally {
    resetJwtVerifier();
  }
});

Deno.test("新規プロフィール作成が成功する", async () => {
  const mockPool = {
    connect: () => Promise.resolve({
      queryObject: (sql: string) => {
        if (sql.includes("SELECT")) return Promise.resolve({ rows: [] }); // プロフィールなし
        if (sql.includes("INSERT")) return Promise.resolve({ rows: [{ id: "profile-1", display_name: "TestUser", avatar_url: null, auth_provider: "steam" }] });
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK はここに来る
      },
      release: () => {}
    })
  };
  setDbPool(mockPool);
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));
  try {
    const url = "http://localhost/ensure-profile";
    const res = await handler(new Request(url, { 
      method: "POST", 
      headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "TestUser" })
    }));
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.result, "OK");
    assertEquals(data.data.id, "profile-1");
    assertEquals(data.data.displayName, "TestUser");
    assertEquals(data.data.authProvider, "steam");
  } finally {
    resetDbPool();
    resetJwtVerifier();
  }
});

Deno.test("既存プロフィールの更新が成功する", async () => {
  const mockPool = {
    connect: () => Promise.resolve({
      queryObject: (sql: string) => {
        if (sql.includes("SELECT")) return Promise.resolve({ rows: [{ id: "profile-1", display_name: "OldUser", avatar_url: null, auth_provider: "steam" }] }); // 既存プロフィール
        if (sql.includes("UPDATE")) return Promise.resolve({ rows: [{ id: "profile-1", display_name: "NewUser", avatar_url: "https://example.com/avatar.png", auth_provider: "steam" }] });
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/ROLLBACK はここに来る
      },
      release: () => {}
    })
  };
  setDbPool(mockPool);
  setJwtVerifier(async () => ({ sub: "profile-1", app_metadata: { provider: "steam", role: "user" } }));
  try {
    const url = "http://localhost/ensure-profile";
    const res = await handler(new Request(url, { 
      method: "POST", 
      headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "NewUser", avatarUrl: "https://example.com/avatar.png" })
    }));
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