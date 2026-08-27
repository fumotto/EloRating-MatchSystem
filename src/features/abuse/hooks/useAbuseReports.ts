import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { abuseClient } from "../../../services/abuseClient";
import { abuseKeys } from "../queryKeys";
import { teamKeys } from "../../team/queryKeys";
import type {
  AdminResolveAbuseReportRequest,
  CreateAbuseReportRequest,
  WithdrawAbuseReportRequest,
} from "../../../types/api";

export function useAbuseReports(openOnly: boolean) {
  return useQuery({
    queryKey: abuseKeys.reports(openOnly),
    queryFn: () => abuseClient.fetchReports({ openOnly }),
  });
}

export function useAbuseAggregates() {
  return useQuery({
    queryKey: abuseKeys.aggregates(),
    queryFn: () => abuseClient.fetchAggregates(),
  });
}

export function useCreateAbuseReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateAbuseReportRequest) => abuseClient.createReport(request),
    // ★試合のキャッシュを無効化しない。通報は試合を変えないためである（ADR-033 ②）。
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: abuseKeys.all });
    },
  });
}

export function useWithdrawAbuseReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: WithdrawAbuseReportRequest) => abuseClient.withdrawReport(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: abuseKeys.all });
    },
  });
}

export function useResolveAbuseReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AdminResolveAbuseReportRequest) => abuseClient.resolveReport(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: abuseKeys.all });
      // BAN・クールダウンでチームの状態が変わる。
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
