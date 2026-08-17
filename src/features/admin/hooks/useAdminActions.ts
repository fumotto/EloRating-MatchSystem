// Mutation Hook（05_Frontend.md 8.2）。管理操作をまとめて提供する。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { auditKeys } from "../queryKeys";
import { settingsKeys } from "../../settings/queryKeys";
import { teamKeys } from "../../team/queryKeys";
import type {
  AdminBanTeamRequest,
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
