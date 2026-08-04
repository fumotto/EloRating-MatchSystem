import { assertEquals } from "jsr:@std/assert";
import { verifyJwt, setJwtVerifier, resetJwtVerifier } from "../supabase/functions/_shared/auth.ts";

// 偽のJWTクレームを返す関数
const mockVerifier = async (token: string) => {
  if (token === "valid-token") {
    return { sub: "user123", app_metadata: { provider: "google", role: "member" } };
  }
  return null;
};

Deno.test("Authorizationヘッダが存在しない場合、nullを返す", async () => {
  const req = new Request("https://example.com", {
    headers: {},
  });
  
  const result = await verifyJwt(req);
  assertEquals(result, null);
});

Deno.test("Bearer形式でないAuthorizationヘッダの場合、nullを返す", async () => {
  const req = new Request("https://example.com", {
    headers: { "Authorization": "Basic abc123" },
  });
  
  const result = await verifyJwt(req);
  assertEquals(result, null);
});

Deno.test("JWT検証に失敗した場合、nullを返す", async () => {
  setJwtVerifier(mockVerifier);
  
  const req = new Request("https://example.com", {
    headers: { "Authorization": "Bearer invalid-token" },
  });
  
  const result = await verifyJwt(req);
  assertEquals(result, null);
  
  resetJwtVerifier();
});

Deno.test("有効なJWTトークンの場合、JWTクレームを返す", async () => {
  setJwtVerifier(mockVerifier);
  
  const req = new Request("https://example.com", {
    headers: { "Authorization": "Bearer valid-token" },
  });
  
  const result = await verifyJwt(req);
  assertEquals(result?.sub, "user123");
  assertEquals(result?.app_metadata?.provider, "google");
  assertEquals(result?.app_metadata?.role, "member");
  
  resetJwtVerifier();
});