// Feature Hook（05_Frontend.md 8.1）。管理者のみが参照できる（View 側の述語で制限）。
//
// ★ここで得られるのは疑いであって証拠ではない。措置を自動で結び付けてはならない
//   （ADR-036 ④）。画面はあくまで管理者の判断材料を並べる。
import { useQuery } from "@tanstack/react-query";
import { adminClient } from "../../../services/adminClient";
import { integrityKeys } from "../queryKeys";

export function useSuspiciousPairs() {
  return useQuery({
    queryKey: integrityKeys.pairs(),
    queryFn: () => adminClient.fetchSuspiciousPairs(),
  });
}

export function useTeamIntegrity() {
  return useQuery({
    queryKey: integrityKeys.teams(),
    queryFn: () => adminClient.fetchTeamIntegrity(),
  });
}
