// ログイン直後にプロフィールを作成・同期する（05_Frontend.md 7章 / 04_BackendInterface.md 4.1）。
// クライアントはログイン完了後に必ず本Functionを呼び出す。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profileClient } from "../../../services/profileClient";
import { profileKeys } from "../queryKeys";
import type { EnsureProfileRequest } from "../../../types/api";

export function useEnsureProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: EnsureProfileRequest) => profileClient.ensureProfile(request),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKeys.me(), profile);
    },
  });
}
