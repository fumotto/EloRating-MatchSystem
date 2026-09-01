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
  // ★廃止した設定（ADR-032 ③）。値は誰も読まない。列とAPIは互換のために残すが、
  //   管理画面には出さない。操作できる場所へ置くと、効かない設定を運営が調整してしまう。
  maxRejectCount: { column: "max_reject_count", min: 0 },
  // シーズン終了の猶予（Issue #9 / Migration 0021）。上限はDBのCHECKと一致させる。
  seasonGraceMinutes: { column: "season_grace_minutes", min: 1, max: 1440 },
  // 勝敗報告の確定方式（ADR-032 ④⑦⑧⑨ / ADR-034 ②③ / Migration 0023）。
  queueCooldownMinutes: { column: "queue_cooldown_minutes", min: 1 },
  reportExtensionMinutes: { column: "report_extension_minutes", min: 1 },
  maxReportExtensions: { column: "max_report_extensions", min: 0 },
  noShowMinutes: { column: "no_show_minutes", min: 1 },
  noShowResponseMinutes: { column: "no_show_response_minutes", min: 1 },
  maxNoContestRequests: { column: "max_no_contest_requests", min: 0 },
  mutualNoContestDailyLimit: { column: "mutual_no_contest_daily_limit", min: 0 },
  avoidanceDays: { column: "avoidance_days", min: 1 },
  maxAvoidanceEntries: { column: "max_avoidance_entries", min: 0 },
  // サブアカウント対策（ADR-036 / Migration 0024）。いずれも 0 で無効になる。
  // ★検証環境で複数アカウントを扱うための ON/OFF はこの2つである。環境変数では切らない。
  //   Edge Function の環境変数はテストから切り替えられず、E2E は同じ Supabase を共有する。
  rematchCooldownHours: { column: "rematch_cooldown_hours", min: 0 },
  rankingMinOpponents: { column: "ranking_min_opponents", min: 0 },
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
  // お知らせ（Issue #7 / Migration 0019）。空なら帯を出さない。
  announcementText: {
    column: "announcement_text",
    minLength: 0,
    maxLength: 200,
    nullable: false,
  },
};

// 選択肢が決まっている設定。文字列だが自由入力ではない。
// ★許可値をここで閉じる。DB の CHECK と一致させること。
const ENUM_SETTINGS: Record<string, { column: string; values: readonly string[] }> = {
  announcementLevel: {
    column: "announcement_level",
    values: ["INFO", "WARN", "ALERT"] as const,
  },
};

// 真偽値の設定。
//
// ★ここへ `matchmaking_paused` / `updates_locked` / `current_season` を足してはならない
//   （ADR-034 ⑤ / ADR-037 ②）。3つともシーズン運用の Function だけが書き換える列であり、
//   本APIから触れると、シーズン切替の途中で運営が状態を壊せてしまう。
//   `maintenance_paused` を別列にした意味も失われる。
const BOOLEAN_SETTINGS: Record<string, { column: string }> = {
  // 保守による一時停止（ADR-034 ⑤ / Migration 0023）。シーズンの停止とは別の列である。
  maintenancePaused: { column: "maintenance_paused" },
};

const ALL_COLUMNS = [
  ...Object.values(SETTINGS).map((s) => s.column),
  ...Object.values(TEXT_SETTINGS).map((s) => s.column),
  ...Object.values(ENUM_SETTINGS).map((s) => s.column),
  ...Object.values(BOOLEAN_SETTINGS).map((s) => s.column),
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
    const updates: { column: string; value: number | string | boolean | null }[] = [];

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

    // 選択肢が決まっている設定（Issue #7）。
    for (const [key, spec] of Object.entries(ENUM_SETTINGS)) {
      const value = body[key];
      if (value === undefined) continue;

      if (typeof value !== "string" || !spec.values.includes(value)) {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }

      updates.push({ column: spec.column, value });
    }

    // 真偽値の設定（ADR-034 ⑤）。
    //
    // ★文字列の "true" を受け取らない。JSON の真偽値だけを認める。
    //   曖昧に受けると、意図せず保守停止を立てたり解除したりできてしまう。
    for (const [key, spec] of Object.entries(BOOLEAN_SETTINGS)) {
      const value = body[key];
      if (value === undefined) continue;

      if (typeof value !== "boolean") {
        return businessError("ADMIN-002", "Invalid system settings.", 400);
      }

      updates.push({ column: spec.column, value });
    }

    if (updates.length === 0) {
      return businessError("ADMIN-002", "Invalid system settings.", 400);
    }

    const settings = await withTransaction(async (tx) => {
      // 変更前の値を監査ログへ残すため、更新前に読む。
      // 数値・文字列・真偽値が混在する（Issue #8 の表示設定と ADR-034 ⑤ の保守停止）。
      const before = await tx.queryObject<Record<string, number | string | boolean | null>>(
        `SELECT ${ALL_COLUMNS} FROM system_settings WHERE id = 1`,
      );

      if (before.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      // 列名は SETTINGS の定義から採るため、利用者入力がSQLへ混ざることはない。
      const assignments = updates
        .map((u, index) => `${u.column} = $${index + 1}`)
        .join(", ");

      const after = await tx.queryObject<Record<string, number | string | boolean | null>>(
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
