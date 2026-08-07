// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";
import { rankingKeys } from "../../ranking/queryKeys";
import type { CreateTeamRequest } from "../../../types/api";

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateTeamRequest) => teamClient.createTeam(request),
    onSuccess: () => {
      // ★キャッシュを直接書き換えず、必ず再取得する（05_Frontend.md 10章）。
      void queryClient.invalidateQueries({ queryKey: teamKeys.my() });
      void queryClient.invalidateQueries({ queryKey: rankingKeys.all });
    },
  });
}
