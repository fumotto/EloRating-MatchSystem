// Mutation の失敗からエラーコードを取り出す（05_Frontend.md 12.2）。
//
// 各画面で instanceof の分岐を書かないよう共通化する。
// 通信層の失敗など code を持たないものは SYSTEM-001 として扱う。
import { ApiError } from "../services/invoke";

export function apiErrorCode(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError) return error.code;
  return "SYSTEM-001";
}
