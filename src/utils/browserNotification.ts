// ブラウザ通知（Issue #5）。
//
// ★権限要求は利用者の操作を起点に行う。読み込み直後に求めると、
//   多くのブラウザが拒否またはブロック扱いにし、以後求め直せなくなる。
//   本システムでは「マッチングを開始」を押した時点で求める。
//   相手を待つ場面であり、通知が要る理由が利用者にも分かる。
//
// ★通知が出せなくても機能を止めない。画面内の演出が本体であり、
//   通知は画面を見ていない場合の補助である。

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 通知の許可を求める。既に決定済みなら何もしない。
 * 拒否された場合も例外にしない（呼び出し側は結果を気にしなくてよい）。
 */
export async function requestNotificationPermission(): Promise<void> {
  if (!isNotificationSupported()) return;
  // ★"denied" のとき再度求めてはならない。ブラウザによっては
  //   利用者へ確認を出さずに拒否を返し続けるだけである。
  if (Notification.permission !== "default") return;

  try {
    await Notification.requestPermission();
  } catch {
    // 古い実装ではコールバック形式のみを持つ。出せないだけなので黙って諦める。
  }
}

/**
 * 通知を出す。許可が無い場合や失敗した場合は何もしない。
 */
export function showNotification(title: string, body: string, tag?: string): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;

  try {
    // tag を付けると、同じ内容の通知が積み上がらず置き換わる。
    // ★戻り値は使わないが、生成そのものが表示である。変数へ受けて lint を満たす。
    const notification = new Notification(title, { body, tag });
    void notification;
  } catch {
    // Service Worker 経由でしか出せない環境がある。その場合は画面内の演出に委ねる。
  }
}
