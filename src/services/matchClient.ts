// Backend Client（05_Frontend.md 3章）。UI・状態を持たない。
//
// 更新系は Edge Function、読み取りは View への Query である（04_BackendInterface.md 2章）。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  ApproveMatchRequest,
  ApproveMatchResponse,
  CancelMatchQueueRequest,
  CancelMatchQueueResponse,
  MatchDetail,
  MatchListEntry,
  MatchStatus,
  QueueMatchRequest,
  QueueMatchResponse,
  QueueStatus,
  RejectMatchRequest,
  RejectMatchResponse,
  ReportMatchRequest,
  ReportMatchResponse,
} from "../types/api";

interface MatchListRow {
  id: string;
  team_a_id: string;
  team_a_name: string;
  team_a_rating: number;
  team_b_id: string;
  team_b_name: string;
  team_b_rating: number;
  winner_team_id: string | null;
  status: MatchStatus;
  started_at: string;
  completed_at: string | null;
}

interface MatchDetailRow extends MatchListRow {
  reported_by_id: string | null;
  reported_by_name: string | null;
  reported_at: string | null;
  approved_by_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  auto_approved: boolean;
  reject_count: number;
  report_deadline_at: string;
  approve_deadline_at: string | null;
  version: number;
}

const toListEntry = (row: MatchListRow): MatchListEntry => ({
  id: row.id,
  teamAId: row.team_a_id,
  teamAName: row.team_a_name,
  teamARating: row.team_a_rating,
  teamBId: row.team_b_id,
  teamBName: row.team_b_name,
  teamBRating: row.team_b_rating,
  winnerTeamId: row.winner_team_id,
  status: row.status,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

export const matchClient = {
  queueMatch(request: QueueMatchRequest): Promise<QueueMatchResponse> {
    return invoke<QueueMatchRequest, QueueMatchResponse>("queue-match", request);
  },

  cancelQueue(request: CancelMatchQueueRequest): Promise<CancelMatchQueueResponse> {
    return invoke<CancelMatchQueueRequest, CancelMatchQueueResponse>("cancel-match-queue", request);
  },

  // ★version を必ず送る（05_Frontend.md 9章）。値は Match Detail から取る。
  reportMatch(request: ReportMatchRequest): Promise<ReportMatchResponse> {
    return invoke<ReportMatchRequest, ReportMatchResponse>("report-match", request);
  },

  approveMatch(request: ApproveMatchRequest): Promise<ApproveMatchResponse> {
    return invoke<ApproveMatchRequest, ApproveMatchResponse>("approve-match", request);
  },

  rejectMatch(request: RejectMatchRequest): Promise<RejectMatchResponse> {
    return invoke<RejectMatchRequest, RejectMatchResponse>("reject-match", request);
  },

  // 戦績は COMPLETED / DRAWN が対象である（TC-MATCH-077）。
  async fetchMatchList(
    filter: { status?: MatchStatus[]; limit?: number; offset?: number } = {},
  ): Promise<MatchListEntry[]> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    let query = supabase
      .from("match_list_view")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter.status && filter.status.length > 0) {
      query = query.in("status", filter.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data as MatchListRow[]).map(toListEntry);
  },

  async fetchMatchDetail(matchId: string): Promise<MatchDetail | null> {
    const { data, error } = await supabase
      .from("match_detail_view")
      .select("*")
      .eq("id", matchId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as MatchDetailRow;
    return {
      ...toListEntry(row),
      reportedById: row.reported_by_id,
      reportedByName: row.reported_by_name,
      reportedAt: row.reported_at,
      approvedById: row.approved_by_id,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      autoApproved: row.auto_approved,
      rejectCount: row.reject_count,
      reportDeadlineAt: row.report_deadline_at,
      approveDeadlineAt: row.approve_deadline_at,
      version: row.version,
    };
  },

  // 待機中でなければ null。他チームの待機状況はRLSにより参照できない（TC-QUEUE-046）。
  async fetchQueueStatus(teamId: string): Promise<QueueStatus | null> {
    const { data, error } = await supabase
      .from("matching_queue")
      .select("team_id, queued_at")
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as { team_id: string; queued_at: string };
    return { teamId: row.team_id, queuedAt: row.queued_at };
  },
};
