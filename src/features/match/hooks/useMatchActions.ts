// Mutation Hook（05_Frontend.md 8.2）。申告・承認・拒否をまとめて提供する。
//
// ★いずれも version を送る（9章）。MATCH-008 を受けた場合は Match Detail を再取得し、
//   利用者へやり直しを促す。楽観ロック値を自動で再送してはならない。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { matchKeys } from "../queryKeys";
import { rankingKeys } from "../../ranking/queryKeys";
import { teamKeys } from "../../team/queryKeys";
import type {
  ApproveMatchRequest,
  RejectMatchRequest,
  ReportMatchRequest,
} from "../../../types/api";

function useInvalidateMatch(matchId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
    void queryClient.invalidateQueries({ queryKey: matchKeys.all });
  };
}

export function useReportMatch(matchId: string) {
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: ReportMatchRequest) => matchClient.reportMatch(request),
    // 競合（MATCH-008）でも最新状態を取り直す必要があるため、成否によらず invalidate する。
    onSettled: invalidate,
  });
}

export function useApproveMatch(matchId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: ApproveMatchRequest) => matchClient.approveMatch(request),
    onSettled: () => {
      invalidate();
      // 承認でレートが動く。ランキングと自チームも再取得する。
      void queryClient.invalidateQueries({ queryKey: rankingKeys.all });
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

export function useRejectMatch(matchId: string) {
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: RejectMatchRequest) => matchClient.rejectMatch(request),
    onSettled: invalidate,
  });
}
