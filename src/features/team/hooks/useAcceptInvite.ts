// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";
import type { AcceptTeamInviteRequest } from "../../../types/api";

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AcceptTeamInviteRequest) => teamClient.acceptInvite(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
