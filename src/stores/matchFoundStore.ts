// マッチング成立演出の表示状態（Issue #5）。
//
// ★UI状態のみを持つ（ADR-011）。ここに保持するのは「どの試合の演出を出しているか」
//   だけであり、試合そのものの内容は TanStack Query が持つ。
//
// ★Realtime の購読は useRealtimeSubscription が一手に引き受けている（05_Frontend.md 10章）。
//   購読を増やさず、そこから本ストアへ通知する形にする。
//   購読を分散させると、解除漏れと二重購読が起きやすい。
import { create } from "zustand";

interface MatchFoundState {
  /** 演出中の試合ID。null なら演出を出さない。 */
  matchId: string | null;
  /** 同じ試合で二度演出しないための記録。再購読や再描画で重複するのを防ぐ。 */
  shown: string[];
  notify: (matchId: string) => void;
  dismiss: () => void;
}

// 記録は直近のみ保持する。無制限に伸ばす必要がない。
const SHOWN_LIMIT = 20;

export const useMatchFoundStore = create<MatchFoundState>()((set, get) => ({
  matchId: null,
  shown: [],

  notify: (matchId) => {
    // ★同じ試合を二度出さない。Realtime は再接続時に取りこぼしを補うことがあり、
    //   そのたびに全画面の演出が走ると操作を妨げる。
    if (get().shown.includes(matchId)) return;

    set((s) => ({
      matchId,
      shown: [matchId, ...s.shown].slice(0, SHOWN_LIMIT),
    }));
  },

  dismiss: () => set({ matchId: null }),
}));
