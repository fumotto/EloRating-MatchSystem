import { ok, businessError, systemError } from "../_shared/response.ts";
import { verifyJwt, setJwtVerifier, resetJwtVerifier } from "../_shared/auth.ts";
import { withTransaction, setDbPool, resetDbPool } from "../_shared/db.ts";

interface EnsureProfileRequest {
  displayName: string;
  avatarUrl?: string;
}

interface EnsureProfileResponse {
  id: string;
  displayName: string;
  avatarUrl?: string;
  authProvider: string;
}

export async function handler(req: Request): Promise<Response> {
  const claims = await verifyJwt(req);
  if (!claims) {
    return businessError("AUTH-001", "認証が必要です", 401);
  }

  const userId = claims.sub;
  const authProvider = claims.app_metadata?.provider ?? "steam";

  const body = await req.json();
  const request: EnsureProfileRequest = {
    displayName: body.displayName,
    avatarUrl: body.avatarUrl,
  };

  // Validation
  if (!request.displayName || request.displayName.length < 1 || request.displayName.length > 50) {
    return businessError("VALIDATION-001", "表示名は1〜50文字で入力してください", 400);
  }

  const result = await withTransaction<EnsureProfileResponse>(async (tx) => {
    // Check if profile exists
    const selectResult = await tx.queryObject<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      auth_provider: string;
    }>(
      `SELECT id, display_name, avatar_url, auth_provider FROM profiles WHERE id = $1`,
      [userId]
    );

    if (selectResult.rows.length > 0) {
      // Update existing profile
      const updateResult = await tx.queryObject<{
        id: string;
        display_name: string;
        avatar_url: string | null;
        auth_provider: string;
      }>(
        `UPDATE profiles SET display_name = $1, avatar_url = $2 WHERE id = $3 RETURNING id, display_name, avatar_url, auth_provider`,
        [request.displayName, request.avatarUrl, userId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error("Failed to update profile");
      }

      const row = updateResult.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        authProvider: row.auth_provider,
      };
    } else {
      // Insert new profile
      const insertResult = await tx.queryObject<{
        id: string;
        display_name: string;
        avatar_url: string | null;
        auth_provider: string;
      }>(
        `INSERT INTO profiles (id, auth_provider, provider_user_id, display_name, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, display_name, avatar_url, auth_provider`,
        [userId, authProvider, userId, request.displayName, request.avatarUrl]
      );

      if (insertResult.rows.length === 0) {
        throw new Error("Failed to insert profile");
      }

      const row = insertResult.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        authProvider: row.auth_provider,
      };
    }
  });

  return ok(result);
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setJwtVerifier, resetJwtVerifier } from "../_shared/auth.ts";

if (import.meta.main) {
  Deno.serve(handler);
}