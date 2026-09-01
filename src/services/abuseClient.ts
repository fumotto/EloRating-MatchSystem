// Backend Client（05_Frontend.md 3章 / ADR-033）。
//
// ★通報は勝敗フローから完全に独立している。試合の状態にもレートにも影響しない。
// ★reporterTeamId を送らない。サーバが JWT から導出する。送れると通報元チーム数を
//   偽装でき、累積による判断（ADR-033 ④）が壊れる。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  AbuseReasonCode,
  AbuseReportAggregate,
  AbuseReportEntry,
  AbuseReportStatus,
  AdminResolveAbuseReportRequest,
  AdminResolveAbuseReportResponse,
  AdminVoidMatchesRequest,
  AdminVoidMatchesResponse,
  CreateAbuseReportRequest,
  CreateAbuseReportResponse,
  WithdrawAbuseReportRequest,
  WithdrawAbuseReportResponse,
} from "../types/api";

interface AbuseReportRow {
  id: string;
  target_team_id: string;
  reporter_team_id: string | null;
  match_id: string | null;
  reason_code: AbuseReasonCode;
  detail: string;
  evidence_urls: string[] | null;
  status: AbuseReportStatus;
  created_at: string;
}

const toEntry = (row: AbuseReportRow): AbuseReportEntry => ({
  id: row.id,
  targetTeamId: row.target_team_id,
  reporterTeamId: row.reporter_team_id,
  matchId: row.match_id,
  reasonCode: row.reason_code,
  detail: row.detail,
  evidenceUrls: row.evidence_urls ?? [],
  status: row.status,
  createdAt: row.created_at,
});

export const abuseClient = {
  createReport(request: CreateAbuseReportRequest): Promise<CreateAbuseReportResponse> {
    return invoke<CreateAbuseReportRequest, CreateAbuseReportResponse>(
      "create-abuse-report",
      request,
    );
  },

  withdrawReport(request: WithdrawAbuseReportRequest): Promise<WithdrawAbuseReportResponse> {
    return invoke<WithdrawAbuseReportRequest, WithdrawAbuseReportResponse>(
      "withdraw-abuse-report",
      request,
    );
  },

  resolveReport(request: AdminResolveAbuseReportRequest): Promise<AdminResolveAbuseReportResponse> {
    return invoke<AdminResolveAbuseReportRequest, AdminResolveAbuseReportResponse>(
      "admin-resolve-abuse-report",
      request,
    );
  },

  voidMatches(request: AdminVoidMatchesRequest): Promise<AdminVoidMatchesResponse> {
    return invoke<AdminVoidMatchesRequest, AdminVoidMatchesResponse>("admin-void-matches", request);
  },

  // RLS により、管理者は全件、利用者は自分が出した通報のみが返る（03_Database.md 10.10）。
  // ★通報対象のチームには見えない。
  async fetchReports(filter: { openOnly?: boolean } = {}): Promise<AbuseReportEntry[]> {
    let query = supabase
      .from("abuse_reports")
      .select(
        "id, target_team_id, reporter_team_id, match_id, reason_code, detail, evidence_urls, status, created_at",
      )
      .order("created_at", { ascending: true });

    if (filter.openOnly) query = query.eq("status", "OPEN");

    const { data, error } = await query;
    if (error) throw error;
    return (data as AbuseReportRow[]).map(toEntry);
  },

  // 累積（ADR-033 ④）。★reporterTeamCount（m）が判断の主材料である。
  async fetchAggregates(): Promise<AbuseReportAggregate[]> {
    const { data, error } = await supabase
      .from("abuse_report_aggregate_view")
      .select("*")
      .order("reporter_team_count", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => {
      const r = row as {
        target_team_id: string;
        report_count: number;
        reporter_team_count: number;
        sanction_count: number;
        last_reported_at: string;
      };
      return {
        targetTeamId: r.target_team_id,
        reportCount: r.report_count,
        reporterTeamCount: r.reporter_team_count,
        sanctionCount: r.sanction_count,
        lastReportedAt: r.last_reported_at,
      };
    });
  },
};
