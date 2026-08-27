// Mutation Hook（05_Frontend.md 8.2）。管理操作をまとめて提供する。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { auditKeys } from "../queryKeys";
import { settingsKeys } from "../../settings/queryKeys";
import { teamKeys } from "../../team/queryKeys";
import { matchCandidateKeys } from "../queryKeys";
import { matchKeys } from "../../match/queryKeys";
import type {
  AdminBanTeamRequest,
  AdminCreateMatchRequest,
  AdminUnbanTeamRequest,
  UpdateSystemSettingsRequest,
} from "../../../types/api";

export function useAdminBanTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AdminBanTeamRequest) => adminClient.banTeam(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      void queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useAdminUnbanTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AdminUnbanTeamRequest) => adminClient.unbanTeam(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      void queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useAdminUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateSystemSettingsRequest) => adminClient.updateSettings(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      void queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

// 管理者による対戦カードの作成（ADR-035 ⑤ / ADR-039）。
//
// ★候補も再取得する。作成すると人数や進行中の試合は変わらないが、
//   同じ画面で続けて組むため、一覧の鮮度を保つ。
export function useAdminCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AdminCreateMatchRequest) => adminClient.createMatch(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchKeys.all });
      void queryClient.invalidateQueries({ queryKey: matchCandidateKeys.all });
      void queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useMatchCandidates() {
  return useQuery({
    queryKey: matchCandidateKeys.list(),
    queryFn: () => adminClient.fetchMatchCandidates(),
  });
}
