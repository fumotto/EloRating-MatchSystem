// Feature Hook（05_Frontend.md 8.1）。
//
// 人数上限や各種期限の表示に必要なため、一般利用者も参照する（TC-ADMIN-017）。
import { useQuery } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { settingsKeys } from "../queryKeys";

// ★enabled は未認証の画面から呼ぶための口である。system_settings の SELECT は
//   認証済みに限られており（0013_rls.sql）、未認証で叩くと必ず失敗する。
export function useSystemSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: settingsKeys.current(),
    queryFn: () => adminClient.fetchSystemSettings(),
    enabled: options.enabled ?? true,
  });
}
