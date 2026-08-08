// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { queueKeys } from "../queryKeys";
import type { CancelMatchQueueRequest } from "../../../types/api";

export function useCancelQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CancelMatchQueueRequest) => matchClient.cancelQueue(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
