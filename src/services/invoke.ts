// Edge Function 呼び出しの共通処理（04_BackendInterface.md 2章・5章）。
//
// 更新系はすべて Edge Functions を経由する。Query（PostgREST）で更新してはならない。
import { supabase } from "../lib/supabase";
import type { ApiResponse } from "../types/api";
import { ApiError } from "./apiError";

// 呼び出し側は invoke と同じ場所から受け取れるようにしておく。
export { ApiError };

// FunctionsHttpError は応答そのものを context に持つ。ここから error.code を取り出す。
// ネットワーク障害など本文が無い場合だけ SYSTEM-001 とする。
async function readErrorCode(error: unknown): Promise<string> {
  const response = (error as { context?: unknown }).context;
  if (!(response instanceof Response)) return "SYSTEM-001";

  try {
    const body = (await response.json()) as ApiResponse<unknown>;
    return body.error?.code ?? "SYSTEM-001";
  } catch {
    return "SYSTEM-001";
  }
}

export async function invoke<TRequest extends Record<string, unknown>, TResponse>(
  functionName: string,
  body: TRequest,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke<ApiResponse<TResponse>>(functionName, {
    body,
  });

  // ★supabase-js は 2xx 以外を error にし、data を null にする。
  //   業務エラーは 400/401/403/404/409 で返る（06_ErrorCode.md 3章）ため、
  //   ここで本文を読まないと TEAM-004 も INVITE-001 もすべて SYSTEM-001 になり、
  //   「error.code から表示を切り替える」方針（05_Frontend.md 12.2）が成立しない。
  if (error) {
    const code = await readErrorCode(error);
    throw new ApiError(code);
  }

  if (!data || data.result !== "OK" || data.data === undefined) {
    throw new ApiError(data?.error?.code ?? "SYSTEM-001");
  }

  return data.data;
}
