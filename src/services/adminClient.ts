// Backend Client（05_Frontend.md 3章）。管理操作はすべて Edge Function 経由である。
//
// ★画面側のガードは利便性のためであり、認可の保証はバックエンドが行う（5.3）。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  AdminBanTeamRequest,
  AdminBanTeamResponse,
  AdminCreateMatchRequest,
  AdminCreateMatchResponse,
  MatchCandidateTeam,
  AdminUnbanTeamRequest,
  AdminUnbanTeamResponse,
  AuditLogEntry,
  SuspiciousPair,
  SystemSettings,
  TeamIntegrity,
  UpdateSystemSettingsRequest,
  UpdateSystemSettingsResponse,
} from "../types/api";

interface SuspiciousPairRow {
  team_low_id: string;
  team_high_id: string;
  match_count: number;
  low_wins: number;
  high_wins: number;
  concede_count: number;
  avg_settle_minutes: number | null;
  last_completed_at: string;
  one_sided_ratio: number;
  never_concurrent: boolean;
}

interface TeamIntegrityRow {
  team_id: string;
  settled_matches: number;
  distinct_opponents: number;
  gained_total: number;
  top_opponent_id: string;
  top_opponent_matches: number;
  top_opponent_gained: number;
  top_opponent_gain_share: number | null;
}

interface AuditLogRow {
  id: string;
  actor_profile_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export const adminClient = {
  banTeam(request: AdminBanTeamRequest): Promise<AdminBanTeamResponse> {
    return invoke<AdminBanTeamRequest, AdminBanTeamResponse>("admin-ban-team", request);
  },

  unbanTeam(request: AdminUnbanTeamRequest): Promise<AdminUnbanTeamResponse> {
    return invoke<AdminUnbanTeamRequest, AdminUnbanTeamResponse>("admin-unban-team", request);
  },

  // 管理者による対戦カードの作成（ADR-035 ⑤ / ADR-039）。
  createMatch(request: AdminCreateMatchRequest): Promise<AdminCreateMatchResponse> {
    return invoke<AdminCreateMatchRequest, AdminCreateMatchResponse>("admin-create-match", request);
  },

  // 対戦カードの候補。BANチームも含めて返し、画面で除外する。
  // ★人数を返すのは、必須人数を要求しないためである（ADR-039 ④）。
  //   不揃いに気付ける手がかりが画面にしか無い。
  async fetchMatchCandidates(): Promise<MatchCandidateTeam[]> {
    const { data, error } = await supabase
      .from("team_detail_view")
      .select("team_id, team_name, rating, is_banned, member_count")
      .order("team_name", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => {
      const r = row as {
        team_id: string;
        team_name: string;
        rating: number;
        is_banned: boolean;
        member_count: number;
      };
      return {
        teamId: r.team_id,
        teamName: r.team_name,
        rating: r.rating,
        isBanned: r.is_banned,
        memberCount: r.member_count,
      };
    });
  },

  updateSettings(request: UpdateSystemSettingsRequest): Promise<UpdateSystemSettingsResponse> {
    return invoke<UpdateSystemSettingsRequest, UpdateSystemSettingsResponse>(
      "admin-update-system-settings",
      request,
    );
  },

  // システム設定は一般利用者も参照できる。人数上限・期限の表示に必要である（TC-ADMIN-017）。
  async fetchSystemSettings(): Promise<SystemSettings> {
    const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).single();

    if (error) throw error;
    return data as SystemSettings;
  },

  // 監査ログの参照は管理者のみ。制限はRLSが行う（TC-ADMIN-054）。
  async fetchAuditLogs(limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return (data as AuditLogRow[]).map((row) => ({
      id: row.id,
      actorProfileId: row.actor_profile_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  },

  // 疑わしいペア（ADR-036 ④）。管理者以外には0件が返る。制限はView側の述語が行う。
  //
  // ★この一覧は判定ではない。並べ替えの既定を「一方向性 → 試合数」にしているのは、
  //   同じ相手からしか勝っていない組み合わせを上へ出すためであり、上位が黒だという
  //   意味ではない。措置は既存の通報と同じく管理者が決める（ADR-033 ③）。
  async fetchSuspiciousPairs(limit = 50): Promise<SuspiciousPair[]> {
    const { data, error } = await supabase
      .from("suspicious_pair_view")
      .select("*")
      .order("one_sided_ratio", { ascending: false })
      .order("match_count", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as SuspiciousPairRow[]).map((row) => ({
      teamLowId: row.team_low_id,
      teamHighId: row.team_high_id,
      matchCount: row.match_count,
      lowWins: row.low_wins,
      highWins: row.high_wins,
      concedeCount: row.concede_count,
      avgSettleMinutes: row.avg_settle_minutes,
      lastCompletedAt: row.last_completed_at,
      oneSidedRatio: row.one_sided_ratio,
      neverConcurrent: row.never_concurrent,
    }));
  },

  // チーム単位の偏り（ADR-036 ④）。管理者以外には0件が返る。
  async fetchTeamIntegrity(limit = 50): Promise<TeamIntegrity[]> {
    const { data, error } = await supabase
      .from("team_integrity_view")
      .select("*")
      .order("top_opponent_gain_share", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;

    return (data as TeamIntegrityRow[]).map((row) => ({
      teamId: row.team_id,
      settledMatches: row.settled_matches,
      distinctOpponents: row.distinct_opponents,
      gainedTotal: row.gained_total,
      topOpponentId: row.top_opponent_id,
      topOpponentMatches: row.top_opponent_matches,
      topOpponentGained: row.top_opponent_gained,
      topOpponentGainShare: row.top_opponent_gain_share,
    }));
  },
};
