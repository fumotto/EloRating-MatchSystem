// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";
import type { TransferLeaderRequest } from "../../../types/api";

export function useTransferLeader() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TransferLeaderRequest) => teamClient.transferLeader(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
