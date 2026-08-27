// Mutation Hook（05_Frontend.md 8.2）。投了・申告・承認・不成立をまとめて提供する。
//
// ★基本の経路は投了（concede-match / ADR-032 ①）。勝者申告はその代替である。
// ★拒否（reject-match）は廃止した。反論は反対申告（report-match の再呼び出し）で行う。
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
  ConcedeMatchRequest,
  ExtendMatchDeadlineRequest,
  ReportMatchRequest,
  RequestNoContestRequest,
  RespondNoContestRequest,
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

// 投了。確定するのでレートが動く（ADR-032 ①）。
//
// ★呼び出す側は必ず二段階確認を挟むこと（05_Frontend.md 14.6）。
//   確定した結果は訂正できず、押し間違いに対する防御はその確認だけである。
export function useConcedeMatch(matchId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: ConcedeMatchRequest) => matchClient.concedeMatch(request),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: rankingKeys.all });
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

export function useExtendDeadline(matchId: string) {
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: ExtendMatchDeadlineRequest) => matchClient.extendDeadline(request),
    onSettled: invalidate,
  });
}

export function useRequestNoContest(matchId: string) {
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: RequestNoContestRequest) => matchClient.requestNoContest(request),
    onSettled: invalidate,
  });
}

// 承諾すると DRAWN（MUTUAL）で確定する。レートは動かないが試合は終わるため、
// 自チームの状態（進行中の試合の有無）が変わる。
export function useRespondNoContest(matchId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMatch(matchId);

  return useMutation({
    mutationFn: (request: RespondNoContestRequest) => matchClient.respondNoContest(request),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
