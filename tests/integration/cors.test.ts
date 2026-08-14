import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import { corsHeaders, withCors } from "../../supabase/functions/_shared/cors.ts";

// _shared/cors.ts は Deno.env を読むため Deno でのみ実行できる（10_TestSpecification.md 3.1）。
//
// ここで守りたいのは2点である。
//   1. プリフライトが認可より前に、CORSヘッダ付きで返ること
//      （ここが崩れるとブラウザは本リクエストを送らず、原因がCORSエラーとしてしか見えない）
//   2. 許可リストに無い Origin へヘッダを返さないこと
//      （反射してしまうと任意のサイトから利用者の資格情報で呼べる）

const ALLOWED = "https://fumotto.github.io";
const DENIED = "https://attacker.example.com";

const okHandler = () =>
  Promise.resolve(
    new Response(JSON.stringify({ result: "OK" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

const unauthorizedHandler = () =>
  Promise.resolve(
    new Response(JSON.stringify({ result: "NG", error: { code: "AUTH-001" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  );

function request(method: string, origin: string | null): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("https://example.supabase.co/functions/v1/create-team", {
    method,
    headers,
  });
}

describe("_shared/cors", () => {
  it("allows a registered origin", () => {
    const headers = corsHeaders(ALLOWED);
    assertEquals(headers["Access-Control-Allow-Origin"], ALLOWED);
    // supabase-js が送るヘッダが揃っていないとプリフライトが通らない。
    assertEquals(
      headers["Access-Control-Allow-Headers"],
      "authorization, content-type, apikey, x-client-info",
    );
  });

  it("does not reflect an unregistered origin", () => {
    const headers = corsHeaders(DENIED);
    assertEquals(headers["Access-Control-Allow-Origin"], undefined);
  });

  it("always sets Vary so caches do not mix origins", () => {
    assertEquals(corsHeaders(ALLOWED)["Vary"], "Origin");
    assertEquals(corsHeaders(DENIED)["Vary"], "Origin");
    assertEquals(corsHeaders(null)["Vary"], "Origin");
  });

  it("answers the preflight with 204 without calling the handler", async () => {
    let called = false;
    const handler = () => {
      called = true;
      return okHandler();
    };

    const res = await withCors(handler)(request("OPTIONS", ALLOWED));

    assertEquals(res.status, 204);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
    // ★プリフライトは Authorization を持たない。認可へ進ませてはならない。
    assertEquals(called, false);
  });

  it("keeps the handler response intact and adds the headers", async () => {
    const res = await withCors(okHandler)(request("POST", ALLOWED));

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
    assertEquals(res.headers.get("Content-Type"), "application/json");
    assertEquals(await res.json(), { result: "OK" });
  });

  it("adds the headers to error responses as well", async () => {
    // ★これが無いと業務エラーがブラウザ側でCORSエラーに化け、
    //   error.code から表示を切り替える方針（05_Frontend.md 12.2）が成立しない。
    const res = await withCors(unauthorizedHandler)(request("POST", ALLOWED));

    assertEquals(res.status, 401);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
    assertEquals(await res.json(), { result: "NG", error: { code: "AUTH-001" } });
  });

  it("still answers an unregistered origin but without the allow header", async () => {
    const res = await withCors(okHandler)(request("POST", DENIED));

    // サーバは応答するが、ヘッダが無いためブラウザが結果を渡さない。
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  });
});
