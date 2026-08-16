// ===== supabase/functions/admin-update-system-settings/index.ts =====
// システム設定の変更（04_BackendInterface.md 12.3）。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

// DTOの項目名（camelCase）と列名（snake_case）の対応、および許容範囲。
// ★範囲は 03_Database.md の system_settings CHECK制約と一致させる。
//   ここで通してDB側で落ちると、原因が ADMIN-002 ではなく SYSTEM-001 になってしまう。
const SETTINGS: Record<string, { column: string; min: number; max?: number }> = {
  // 1人チームを許す（Issue #4 / Migration 0017）。
  teamMaxMembers: { column: "team_max_members", min: 1 },
  initialRating: { column: "initial_rating", min: 100 },
  ratingK: { column: "rating_k", min: 1, max: 128 },
  matchRatingRange: { column: "match_rating_range", min: 1 },
  inviteExpirationHours: { column: "invite_expiration_hours", min: 1 },
  reportTimeoutMinutes: { column: "report_timeout_minutes", min: 1 },
  approveTimeoutMinutes: { column: "approve_timeout_minutes", min: 1 },
  maxRejectCount: { column: "max_reject_count", min: 0 },
};

// 表示設定（Issue #8 / Migration 0018）。文字列であるため数値とは検証が異なる。
//
// ★制約は 0018 の CHECK と一致させる。ここで通してDB側で落ちると、
//   原因が ADMIN-002 ではなく SYSTEM-001 になってしまう。
//
// ★nullable は「空文字を送ったら NULL にする」ことを表す。背景画像の解除に使う。
const TEXT_SETTINGS: Record<
  string,
  { column: string; maxLength: number; minLength: number; nullable: boolean; pattern?: RegExp }
> = {
  siteTitle: { column: "site_title", minLength: 1, maxLength: 60, nullable: false },
  // 背景画像は public/ 配下の相対パスである（Migration 0018）。
  // ★絶対URL・スキーム相対（//host）・ディレクトリ遡上（..）を弾く。
  backgroundImagePath: {
    column: "background_image_path",
    minLength: 1,
    maxLength: 200,
    nullable: true,
    pattern: /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  rulesMarkdown: { column: "rules_markdown", minLength: 0, maxLength: 20000, nullable: false },
};

const ALL_COLUMNS = [
  ...Object.values(SETTINGS).map((s) => s.column),
  ...Object.values(TEXT_SETTINGS).map((s) => s.column),
].join(", ");

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }
    if (!isAdmin(claims)) {
      return businessError("ADMIN-001", "Administrator role required.", 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // 指定された項目のみ更新する（12.3）。
    const updates: { column: string; value: number | string | null }[] = [];

    for (const [key, spec] of Object.entries(SETTINGS)) {
      const value = body[key];
      if (value === undefined) continue;

      if (typeof value !== "number" || !Number.isInteger(value)) {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }
      if (value < spec.min || (spec.max !== undefined && value > spec.max)) {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }

      updates.push({ column: spec.column, value });
    }

    // 表示設定（Issue #8）。
    for (const [key, spec] of Object.entries(TEXT_SETTINGS)) {
      const value = body[key];
      if (value === undefined) continue;

      if (typeof value !== "string") {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }

      const trimmed = value.trim();

      // 空文字は「解除」を意味する。NULL を許さない列では長さ検証へ進む。
      if (trimmed.length === 0 && spec.nullable) {
        updates.push({ column: spec.column, value: null });
        continue;
      }

      if (trimmed.length < spec.minLength || value.length > spec.maxLength) {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }
      if (spec.pattern && !spec.pattern.test(trimmed)) {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }

      // ★本文（Markdown）は前後の空白を落とさない。整形の一部でありうる。
      //   URL とタイトルは落とす。貼り付け時の空白が事故になる。
      updates.push({
        column: spec.column,
        value: spec.column === "rules_markdown" ? value : trimmed,
      });
    }

    if (updates.length === 0) {
      return businessError("ADMIN-002", "Invalid system settings.", 400);
    }

    const settings = await withTransaction(async (tx) => {
      // 変更前の値を監査ログへ残すため、更新前に読む。
      // 数値と文字列が混在する（Issue #8 で表示設定を追加した）。
      const before = await tx.queryObject<Record<string, number | string | null>>(
        `SELECT ${ALL_COLUMNS} FROM system_settings WHERE id = 1`,
      );

      if (before.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      // 列名は SETTINGS の定義から採るため、利用者入力がSQLへ混ざることはない。
      const assignments = updates
        .map((u, index) => `${u.column} = $${index + 1}`)
        .join(", ");

      const after = await tx.queryObject<Record<string, number | string | null>>(
        `UPDATE system_settings SET ${assignments} WHERE id = 1 RETURNING ${ALL_COLUMNS}`,
        updates.map((u) => u.value),
      );

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'SETTINGS_UPDATED', 'SETTINGS', '1', $2)`,
        [claims.sub, JSON.stringify({ before: before.rows[0], after: after.rows[0] })],
      );

      return after.rows[0];
    });

    // 全画面が設定値を再取得する（04 14章）。
    await broadcast("system", "SYSTEM_SETTINGS_UPDATED", {});

    return ok({ settings });
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setJwtVerifier, resetJwtVerifier } from "../_shared/auth.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
