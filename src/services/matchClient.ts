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
  ReportMatchRequest,
  ReportMatchResponse,
  ConcedeMatchRequest,
  ConcedeMatchResponse,
  ExtendMatchDeadlineRequest,
  ExtendMatchDeadlineResponse,
  RequestNoContestRequest,
  RequestNoContestResponse,
  RespondNoContestRequest,
  RespondNoContestResponse,
  NoContestReason,
  NoContestReasonCode,
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
  no_contest_reason: NoContestReason | null;
  auto_approved: boolean;
}

interface MatchDetailRow extends MatchListRow {
  reported_by_id: string | null;
  reported_by_name: string | null;
  reported_at: string | null;
  approved_by_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  reject_count: number;
  report_deadline_at: string;
  approve_deadline_at: string | null;
  counter_claim_team_id: string | null;
  counter_claimed_at: string | null;
  report_extension_count: number;
  no_contest_requested_by_team_id: string | null;
  no_contest_requested_at: string | null;
  no_contest_reason_code: NoContestReasonCode | null;
  no_contest_request_count: number;
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
  noContestReason: row.no_contest_reason,
  autoApproved: row.auto_approved,
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

  // ★投了は基本の経路である（ADR-032 ①）。winnerTeamId を送らない。
  //   受け取れてしまうと、投了に見せかけて相手の敗北を登録できる。
  concedeMatch(request: ConcedeMatchRequest): Promise<ConcedeMatchResponse> {
    return invoke<ConcedeMatchRequest, ConcedeMatchResponse>("concede-match", request);
  },

  extendDeadline(request: ExtendMatchDeadlineRequest): Promise<ExtendMatchDeadlineResponse> {
    return invoke<ExtendMatchDeadlineRequest, ExtendMatchDeadlineResponse>(
      "extend-match-deadline",
      request,
    );
  },

  requestNoContest(request: RequestNoContestRequest): Promise<RequestNoContestResponse> {
    return invoke<RequestNoContestRequest, RequestNoContestResponse>("request-no-contest", request);
  },

  respondNoContest(request: RespondNoContestRequest): Promise<RespondNoContestResponse> {
    return invoke<RespondNoContestRequest, RespondNoContestResponse>("respond-no-contest", request);
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
      rejectCount: row.reject_count,
      reportDeadlineAt: row.report_deadline_at,
      approveDeadlineAt: row.approve_deadline_at,
      counterClaimTeamId: row.counter_claim_team_id,
      counterClaimedAt: row.counter_claimed_at,
      reportExtensionCount: row.report_extension_count,
      noContestRequestedByTeamId: row.no_contest_requested_by_team_id,
      noContestRequestedAt: row.no_contest_requested_at,
      noContestReasonCode: row.no_contest_reason_code,
      noContestRequestCount: row.no_contest_request_count,
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

// 試合確定後のレート変動（Issue #6）。
//
// ★確定していない試合には行が存在しない。引き分け（DRAWN）でも作られない
//   （08_RatingSpecification.md 4章）。呼び出し側は空配列を正常として扱う。
export async function fetchMatchRatingResults(
  matchId: string,
): Promise<import("../types/api").MatchRatingResult[]> {
  const { data, error } = await supabase
    .from("rating_history")
    .select("team_id, before_rating, after_rating, rating_change, result")
    .eq("match_id", matchId);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as {
      team_id: string;
      before_rating: number;
      after_rating: number;
      rating_change: number;
      result: "WIN" | "LOSE";
    };
    return {
      teamId: r.team_id,
      beforeRating: r.before_rating,
      afterRating: r.after_rating,
      ratingChange: r.rating_change,
      result: r.result,
    };
  });
}
