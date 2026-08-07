// TanStack Query の設定（05_Frontend.md 11章・12章）。
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../services/invoke";

// 再試行の方針（12章）。
// ネットワークエラーは3回まで。401 / 403 / 409 / 500 は再試行しない。
const NO_RETRY_PREFIXES = ["AUTH-", "VALIDATION-", "TEAM-", "PROFILE-", "ADMIN-", "SYSTEM-"];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && NO_RETRY_PREFIXES.some((p) => error.code.startsWith(p))) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      // 更新の再送は状態遷移を二重に起こしうる。自動再送しない（06_ErrorCode.md 15章）。
      retry: false,
    },
  },
});
