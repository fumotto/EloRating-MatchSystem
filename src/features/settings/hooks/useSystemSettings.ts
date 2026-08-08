// Feature Hook（05_Frontend.md 8.1）。
//
// 人数上限や各種期限の表示に必要なため、一般利用者も参照する（TC-ADMIN-017）。
import { useQuery } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { settingsKeys } from "../queryKeys";

export function useSystemSettings() {
  return useQuery({
    queryKey: settingsKeys.current(),
    queryFn: () => adminClient.fetchSystemSettings(),
  });
}
