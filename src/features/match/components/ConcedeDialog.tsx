// 投了の確認ダイアログ（05_Frontend.md 14.6 / ADR-032 ①）。
//
// ★投了は押下で即座に確定させてはならない。相手チーム名を明示した確認を挟む。
// ★「次回から表示しない」を設けてはならない。投了は基本の導線であり、慣れるほど
//   誤押下の機会が増える。確定した結果は訂正できず（ADR-033 ①）、押し間違いに
//   対する防御はこの確認だけである。
import { useEffect, useRef } from "react";

interface Props {
  opponentName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConcedeDialog({ opponentName, isPending, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 既定のフォーカスは「やめる」に置く。Enter の連打で確定させない。
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="concede-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
        <h2 id="concede-title" className="text-base font-semibold">
          投了しますか？
        </h2>
        <p className="mt-3 text-sm">
          <strong>{opponentName}</strong> の勝利として確定します。
        </p>
        <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">
          確定後は取り消せません。運営でも元に戻せません。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
          >
            やめる
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isPending ? "送信中…" : "確定する"}
          </button>
        </div>
      </div>
    </div>
  );
}
