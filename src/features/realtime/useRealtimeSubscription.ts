// Realtime購読（05_Frontend.md 10章）。
//
// AppLayout の初期化時に開始し、アンマウント（ログアウト）で解除する。
// 購読は画面ごとではなくここで一括管理する（6章）。
//
// ★受信データでキャッシュを直接書き換えてはならない。必ず invalidate して再取得する（10.2）。
//   イベント名の正本は 04_BackendInterface.md 7章である。
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { matchKeys, queueKeys } from "../match/queryKeys";
import { rankingKeys } from "../ranking/queryKeys";
import { seasonKeys } from "../season/queryKeys";
import { settingsKeys } from "../settings/queryKeys";
import { teamKeys } from "../team/queryKeys";
import { useMatchFoundStore } from "../../stores/matchFoundStore";
import { showNotification } from "../../utils/browserNotification";

type ChannelName = "ranking" | "match" | "team" | "system";

// 未認証時は ranking のみ購読する（10.1）。/ranking は未認証でも表示されるためである。
const PUBLIC_CHANNELS: ChannelName[] = ["ranking"];
const AUTHENTICATED_CHANNELS: ChannelName[] = ["ranking", "match", "team", "system"];

export function useRealtimeSubscription(isAuthenticated: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channels = isAuthenticated ? AUTHENTICATED_CHANNELS : PUBLIC_CHANNELS;

    const invalidate = (keys: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey: keys });
    };

    const subscriptions = channels.map((name) => {
      const channel = supabase.channel(name);

      switch (name) {
        case "ranking":
          // RANKING_UPDATED
          channel.on("broadcast", { event: "*" }, () => invalidate(rankingKeys.all));
          break;
        case "match":
          // MATCH_CREATED / WINNER_REPORTED / MATCH_REJECTED / MATCH_COMPLETED / MATCH_DRAWN
          channel.on("broadcast", { event: "*" }, (message) => {
            invalidate(matchKeys.all);
            invalidate(queueKeys.all);
            // 確定・解散はレートに影響しうるため、ランキングも取り直す（10.2）。
            const event = (message as { event?: string }).event;
            if (event === "MATCH_COMPLETED" || event === "MATCH_DRAWN") {
              invalidate(rankingKeys.all);
            }

            // マッチング成立の演出と通知（Issue #5）。
            //
            // ★購読はここに一本化する（10章）。演出側で別途購読すると、
            //   解除漏れと二重購読が起きる。ストアへ通知するだけに留める。
            //
            // ★自チームが当事者かはここで判定しない。ブロードキャストは
            //   全員へ届くが、演出側が試合詳細と自チームを突き合わせる。
            if (event === "MATCH_CREATED") {
              const matchId = (message as { payload?: { matchId?: string } }).payload?.matchId;
              if (typeof matchId === "string") {
                useMatchFoundStore.getState().notify(matchId);
                showNotification(
                  "対戦相手が決まりました",
                  "試合画面で結果を申告してください。",
                  matchId,
                );
              }
            }
          });
          break;
        case "team":
          // TEAM_UPDATED / TEAM_MEMBER_UPDATED
          channel.on("broadcast", { event: "*" }, () => invalidate(teamKeys.all));
          break;
        case "system":
          // SYSTEM_SETTINGS_UPDATED / SEASON_STATE_CHANGED
          //
          // ★シーズンの状態も取り直す。マッチングの可否と更新の可否が同時に変わるため、
          //   設定だけを取り直しても画面は停止中であることに気付けない（Issue #9）。
          channel.on("broadcast", { event: "*" }, () => {
            invalidate(settingsKeys.all);
            invalidate(seasonKeys.all);
          });
          break;
      }

      channel.subscribe();
      return channel;
    });

    return () => {
      for (const channel of subscriptions) {
        void supabase.removeChannel(channel);
      }
    };
  }, [isAuthenticated, queryClient]);
}
