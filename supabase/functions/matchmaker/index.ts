// ===== supabase/functions/matchmaker/index.ts =====
// マッチング処理（04_BackendInterface.md 11.1 / 09_MatchmakingSpecification.md 5章）。
//
// 内部処理専用である。`queue-match` の同期実行で取りこぼした組み合わせを
// Cron（1分間隔）で回収する。アルゴリズム本体は _shared/matchmaking.ts が持つ。
import { isServiceRole } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { runMatchmaking } from "../_shared/matchmaking.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface MatchmakerResponse {
  matchedCount: number;
  matchIds: string[];
}

export async function handler(req: Request): Promise<Response> {
  try {
    // Service Role でのみ実行できる。利用者から直接叩けてはならない。
    if (!isServiceRole(req)) {
      return businessError("AUTH-004", "Forbidden.", 403);
    }

    const { matches } = await withTransaction((tx) => runMatchmaking(tx));

    // コミット後に成立分をまとめて通知する。
    for (const { matchId } of matches) {
      await broadcast("match", "MATCH_CREATED", { matchId });
    }

    const response: MatchmakerResponse = {
      matchedCount: matches.length,
      matchIds: matches.map((m) => m.matchId),
    };

    return ok(response);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(handler);
}
