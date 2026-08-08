// 招待コードの生成とハッシュ化（04_BackendInterface.md 9.3 / 03_Database.md 10.4 / TC-SEC-020・021）。
//
// 招待コードは平文で保存しない。DBへ入るのは `invite_code_hash` だけであり、
// 発行時の応答でしか平文を得られない。したがって「既存の有効な招待を再利用する」ことはできず、
// 再発行時は旧招待を REVOKED にする（9.3）。

// 128bit のエントロピーを持たせる（TC-SEC-021）。総当たりを困難にするための下限である。
export const INVITE_CODE_ENTROPY_BYTES = 16;

// RFC 4648 の base32。16バイトを5bitずつ26文字へ写す。
// 大文字と数字のみで、手入力しても大小の取り違えが起きない。
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // 端数（16バイトでは1bit余る）も1文字へ落とす。パディングは付けない。
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

// 暗号論的乱数を使う。Math.random は予測可能であり使用してはならない。
export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_ENTROPY_BYTES);
  crypto.getRandomValues(bytes);
  return toBase32(bytes);
}

// SHA-256 の16進表記。招待コードは高エントロピーの乱数であり辞書攻撃の対象にならないため、
// パスワードと異なりソルトやストレッチングは用いない。
export async function hashInviteCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
