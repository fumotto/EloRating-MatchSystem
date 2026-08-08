// Mutation Hook（05_Frontend.md 8.2）。
//
// ★平文の招待コードは応答でしか得られない（04 9.3）。キャッシュへ保持せず、
//   画面が受け取った値をその場で表示する。再取得はできない。
import { useMutation } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import type { CreateTeamInviteRequest } from "../../../types/api";

export function useCreateInvite() {
  return useMutation({
    mutationFn: (request: CreateTeamInviteRequest) => teamClient.createInvite(request),
  });
}
