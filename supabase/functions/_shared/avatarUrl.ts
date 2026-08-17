// アイコンURLの許可リスト。
//
// ★avatar_url は利用者が値を決められる。ensure-profile はリクエストボディの値を受け取り、
//   profiles は本人がクライアントから直接UPDATEできる（03_Database.md 19章）。
//   JWTが証明するのは「誰か」であって「送ってきた値が正しいか」ではない
//   （04_BackendInterface.md 4.3）。
//
// ★他人の画面で <img src> に載る点が問題になる。任意のURLを許すと、
//   チーム画面を開いただけで閲覧者のIPとUAが指定先のサーバへ渡る。
//   配信元をプロバイダのCDNに限定する。
//
// ★正本はDBのCHECK制約（Migration 0020）である。ここは同じ規則を手前で適用し、
//   ログインのたびにDBエラーへ落とさないためのものである。規則を変えるときは両方を直す。
const ALLOWED_AVATAR_URL =
  /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|avatars\.steamstatic\.com|avatars\.(akamai|cloudflare)\.steamstatic\.com)\/[A-Za-z0-9._~/-]+(\?[A-Za-z0-9._~=&%-]*)?$/;

// URLの長さの上限。DBのCHECK制約と揃える。
const MAX_AVATAR_URL_LENGTH = 500;

export function isAllowedAvatarUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.length > 0 &&
    url.length <= MAX_AVATAR_URL_LENGTH &&
    ALLOWED_AVATAR_URL.test(url)
  );
}
