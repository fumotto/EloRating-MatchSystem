// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { matchKeys, queueKeys } from "../queryKeys";
import type { QueueMatchRequest } from "../../../types/api";

export function useQueueMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: QueueMatchRequest) => matchClient.queueMatch(request),
    onSuccess: () => {
      // 相手が見つからない（matched: false）のは正常応答である。エラー扱いしない。
      void queryClient.invalidateQueries({ queryKey: queueKeys.all });
      void queryClient.invalidateQueries({ queryKey: matchKeys.all });
    },
  });
}
