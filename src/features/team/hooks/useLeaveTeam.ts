// Mutation Hook（05_Frontend.md 8.2）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";
import { queueKeys } from "../../match/queryKeys";

export function useLeaveTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => teamClient.leaveTeam(),
    onSuccess: () => {
      // 脱退時はキューからも外れる（04 9.5）。待機状態も再取得させる。
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      void queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
