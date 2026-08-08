// 期限までの残り時間の文言化（05_Frontend.md 14.7）。
//
// 期限を過ぎた試合は自動的に解決されるため、残り時間の表示は利用者にとって重要である。
export function remainingTime(deadline: string | null, now: number = Date.now()): string {
  if (!deadline) return "—";

  const remainingMs = new Date(deadline).getTime() - now;
  if (remainingMs <= 0) return "期限切れ（まもなく自動処理されます）";

  const minutes = Math.floor(remainingMs / 60000);
  if (minutes < 60) return `残り約${Math.max(minutes, 1)}分`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `残り約${hours}時間`;

  return `残り約${Math.floor(hours / 24)}日`;
}
