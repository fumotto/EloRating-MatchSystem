// Edge Function 呼び出しの共通処理（04_BackendInterface.md 2章・5章）。
//
// 更新系はすべて Edge Functions を経由する。Query（PostgREST）で更新してはならない。
import { supabase } from "../lib/supabase";
import type { ApiResponse } from "../types/api";

// 業務エラー・システムエラーを表す例外。error.code のみを持ち回り、
// 表示文言は utils/errorMessage.ts が決める（05_Frontend.md 12章）。
export class ApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ApiError";
  }
}

export async function invoke<TRequest extends Record<string, unknown>, TResponse>(
  functionName: string,
  body: TRequest,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke<ApiResponse<TResponse>>(functionName, {
    body,
  });

  // 通信層の失敗（ネットワーク等）。本文が取れていない。
  if (error && !data) {
    throw new ApiError("SYSTEM-001");
  }

  if (!data || data.result !== "OK" || data.data === undefined) {
    throw new ApiError(data?.error?.code ?? "SYSTEM-001");
  }

  return data.data;
}
