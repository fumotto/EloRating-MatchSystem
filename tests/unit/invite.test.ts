import { describe, it, expect } from "vitest";
import {
  generateInviteCode,
  hashInviteCode,
  INVITE_CODE_ENTROPY_BYTES,
} from "../../supabase/functions/_shared/invite.ts";

// 招待コードの生成・ハッシュは外部依存を持たない純ロジックのため Unit で検証する。
describe("_shared/invite", () => {
  it("generates an invite code with sufficient entropy", () => {
    // TC-SEC-021 128bit以上のエントロピー
    expect(INVITE_CODE_ENTROPY_BYTES * 8).toBeGreaterThanOrEqual(128);

    // base32 は1文字あたり5bit。128bit を表すには26文字必要である。
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z2-7]{26}$/);

    // 生成結果が固定値・連番でないこと。同じ値が出れば総当たり以前に破られる。
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBe(200);
  });

  it("hashes the code with SHA-256 and never returns the plaintext", async () => {
    // TC-SEC-020 の前提。DBへ入るのはこのハッシュ値のみである。
    const code = "ABCDEFGHIJKLMNOPQRSTUVWXY2";
    const hash = await hashInviteCode(code);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code);
  });

  it("derives the same hash for the same code", async () => {
    // 参加時はハッシュ値で照合するため、同じコードから常に同じ値が出なければ照合できない。
    const code = generateInviteCode();
    expect(await hashInviteCode(code)).toBe(await hashInviteCode(code));
  });

  it("derives different hashes for different codes", async () => {
    expect(await hashInviteCode(generateInviteCode())).not.toBe(
      await hashInviteCode(generateInviteCode()),
    );
  });
});
