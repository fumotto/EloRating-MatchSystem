// CORS（11_Deployment.md 6章）。ブラウザから直接呼ばれる Function が使う。
//
// ★プリフライト（OPTIONS）は仕様上 Authorization ヘッダを持たない。
//   したがってプラットフォーム側のJWT検証（config.toml の verify_jwt）を有効にしたままだと、
//   関数へ到達する前にゲートウェイが401を返し、CORSヘッダも付かないため
//   ブラウザは本リクエストを送らずに失敗する。
//   verify_jwt = false と本モジュールは対で入れる。片方だけでは直らない。
//
// ★verify_jwt を外しても認可は失われない。全 Function が冒頭で verifyJwt / isServiceRole を
//   呼び、未認証には AUTH-001 を返す（_shared/auth.ts）。検証の主が
//   ゲートウェイから関数自身へ移るだけである。
//
// 内部処理用 Function（matchmaker / auto-resolve-matches / cleanup-*）はブラウザから
// 呼ばれない。本モジュールを適用せず、ゲートウェイの検証も外さない。

// 既定の許可 Origin。環境ごとに変える場合は ALLOWED_ORIGINS（カンマ区切り）で上書きする。
//
// ★Origin にパスは含まれない。GitHub Pages はユーザー単位で1オリジンであるため、
//   `https://fumotto.github.io` を許可すると同一アカウントの他リポジトリの Pages も
//   通ることになる。これはCORSの仕様上さらに絞れない。
const DEFAULT_ALLOWED_ORIGINS = [
  "https://fumotto.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

// supabase-js は authorization のほかに apikey と x-client-info を送る。
// 1つでも欠けるとプリフライトが通らない。
const ALLOW_HEADERS = "authorization, content-type, apikey, x-client-info";
const ALLOW_METHODS = "POST, OPTIONS";

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  // ★Origin ごとに応答が変わる。Vary が無いと中間キャッシュが
  //   別オリジン宛の Allow-Origin を使い回す。
  const headers: Record<string, string> = { Vary: "Origin" };

  // 許可リストに無い Origin へはヘッダを返さない。
  // 受け取った値をそのまま反射してはならない（任意のサイトからの呼び出しを許すことになる）。
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = ALLOW_HEADERS;
    headers["Access-Control-Allow-Methods"] = ALLOW_METHODS;
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

export function withCors(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const headers = corsHeaders(req.headers.get("Origin"));

    // プリフライトは認可より前に応答する。本文は返さない。
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const res = await handler(req);

    // ★エラー応答にもCORSヘッダが要る。付けないと業務エラー（AUTH-001 等）が
    //   ブラウザ側でCORSエラーに化け、error.code から表示を切り替える方針が成立しない。
    const merged = new Headers(res.headers);
    for (const [key, value] of Object.entries(headers)) {
      merged.set(key, value);
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: merged,
    });
  };
}
