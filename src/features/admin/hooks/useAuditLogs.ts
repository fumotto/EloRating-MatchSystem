// Feature Hook（05_Frontend.md 8.1）。管理者のみが参照できる（RLSで制限）。
import { useQuery } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { auditKeys } from "../queryKeys";

export function useAuditLogs() {
  return useQuery({
    queryKey: auditKeys.list(),
    queryFn: () => adminClient.fetchAuditLogs(),
  });
}
