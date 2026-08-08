// Realtime通知（04_BackendInterface.md 7章・14章 / ADR-021）。
//
// 実装方式は Broadcast である。Postgres Changes は使用しない。
// 送信は必ずトランザクションのコミット成功後に行う（04_BackendInterface.md 18章）。
//
// ★送信失敗はロールバックしない（06_ErrorCode.md 14章 SYSTEM-003）。
//   通知はコミット後の付随処理であり、失敗しても確定済みの更新を取り消してはならない。
//   クライアントは次回の取得で最新状態を得る。
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

// 7章の表が唯一の正本である。ここに無いイベント名を使用してはならない。
export type RealtimeChannel = "match" | "ranking" | "team" | "system";

export type RealtimeEvent =
  | "MATCH_CREATED"
  | "WINNER_REPORTED"
  | "MATCH_REJECTED"
  | "MATCH_COMPLETED"
  | "MATCH_DRAWN"
  | "RANKING_UPDATED"
  | "TEAM_UPDATED"
  | "TEAM_MEMBER_UPDATED"
  | "SYSTEM_SETTINGS_UPDATED";

export type Broadcaster = (
  channel: RealtimeChannel,
  event: RealtimeEvent,
  payload: Record<string, unknown>,
) => Promise<void>;

let realtimeClient: SupabaseClient | null = null;

// クライアントはimport時ではなく初回利用時に作る（auth.ts / db.ts と同じ方針）。
function getRealtimeClient(): SupabaseClient {
  if (realtimeClient) return realtimeClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  realtimeClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return realtimeClient;
}

const defaultBroadcaster: Broadcaster = async (channel, event, payload) => {
  const ch = getRealtimeClient().channel(channel);
  try {
    await ch.send({ type: "broadcast", event, payload });
  } finally {
    await getRealtimeClient().removeChannel(ch);
  }
};

let broadcaster: Broadcaster = defaultBroadcaster;

// コミット後に呼ぶ。例外は投げず、失敗はログのみに留める。
export async function broadcast(
  channel: RealtimeChannel,
  event: RealtimeEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await broadcaster(channel, event, payload);
  } catch (e) {
    // 17章のログ方針。個人情報・トークン・招待コードの平文は payload に含めない。
    console.error(
      JSON.stringify({
        errorCode: "SYSTEM-003",
        channel,
        event,
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

// テストから送信本体を差し替えるための口（ADR-021）。
export function setBroadcaster(fn: Broadcaster) {
  broadcaster = fn;
}

export function resetBroadcaster() {
  broadcaster = defaultBroadcaster;
}
