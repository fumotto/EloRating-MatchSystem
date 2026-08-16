// Feature Hook（05_Frontend.md 8.1）。
//
// 未ログインでも参照するため、認証状態に依存させない。
import { useQuery } from "@tanstack/react-query";
import { settingsClient } from "../../../services/settingsClient";
import { settingsKeys } from "../queryKeys";

export function usePublicSettings() {
  return useQuery({
    queryKey: settingsKeys.public(),
    queryFn: () => settingsClient.fetchPublicSettings(),
  });
}
