// JWT検証（04_BackendInterface.md 4章 / ADR-021）。
//
// 検証は Supabase Auth の `auth.getUser(token)` で行う。djwt による自前の署名検証は採用しない。
// Supabase の新規プロジェクトは非対称鍵（ES256）が既定になりうるうえ、
// 鍵のローテーションにも追随できないためである。`getUser` は失効・削除済みユーザーも弾く。
// 依存は他の共通モジュールと同じく https: のフルURLで固定する。
// jsr: 版はnpm依存の解決にルートの node_modules を要求し、Node側のツールチェインと衝突する。
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.47.10";

// 04_BackendInterface.md 4.3 のクレーム。リクエストボディの値を信用してはならない。
export interface JwtClaims {
  sub: string;
  app_metadata?: {
    // 認証プロバイダ（ADR-015 / ADR-022）。
    provider?: string;
    // 管理者ロール。service_role でのみ更新でき、利用者は改ざんできない（ADR-020）。
    role?: string;
  };
  user_metadata?: {
    // プロバイダ側の利用者ID。`profiles.provider_user_id` の出所（ADR-022）。
    provider_id?: string;
  };
}

export type JwtVerifier = (token: string) => Promise<JwtClaims | null>;

let authClient: SupabaseClient | null = null;

// クライアントはimport時ではなく初回利用時に作る。
// トップレベルで作ると、環境変数の無いテスト環境ではimportしただけで壊れる（db.ts と同じ方針）。
function getAuthClient(): SupabaseClient {
  if (authClient) return authClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  authClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return authClient;
}

const defaultVerifier: JwtVerifier = async (token: string) => {
  const { data, error } = await getAuthClient().auth.getUser(token);
  if (error || !data.user) return null;

  const user = data.user;
  return {
    sub: user.id,
    app_metadata: {
      provider: user.app_metadata?.provider,
      role: user.app_metadata?.role,
    },
    user_metadata: {
      provider_id: user.user_metadata?.provider_id,
    },
  };
};

let jwtVerifier: JwtVerifier = defaultVerifier;

export async function verifyJwt(req: Request): Promise<JwtClaims | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    return await jwtVerifier(token);
  } catch {
    return null;
  }
}

// 内部処理用Functionの認可（04_BackendInterface.md 11章）。
// matchmaker / auto-resolve-matches / cleanup-* は利用者のJWTではなく Service Role で呼ばれる。
// Service Role はクライアントへ露出しないため、これが内部処理であることの証明になる（18章）。
//
// ★比較は長さを揃えず単純比較で行わない。鍵の一致判定はタイミング差を残さないようにする。
export function isServiceRole(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return false;

  return timingSafeEqual(authHeader.substring(7), key);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// テストから検証本体を差し替えるための口（ADR-021）。
export function setJwtVerifier(verifier: JwtVerifier) {
  jwtVerifier = verifier;
}

export function resetJwtVerifier() {
  jwtVerifier = defaultVerifier;
}
