// 共通レスポンス生成（04_BackendInterface.md 5章 / 06_ErrorCode.md 2〜3章）。
//
// 本文の形式は 06_ErrorCode.md が正本。HTTPステータスは本文に含まれないため、
// ステータスを運べるのは HTTP Response だけである。よって3つの関数はいずれも
// プレーンオブジェクトではなく Response を返す。
//
// ★本文の型名を Response にしてはいけない。グローバルの Response を覆い隠す。
export interface ApiResponseBody {
  result: "OK" | "NG" | "FATAL";
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const toResponse = (body: ApiResponseBody, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// 正常終了。作成・削除も200で応答する（201・204は使用しない / 06_ErrorCode.md 3章）。
export function ok<T>(data: T): Response {
  return toResponse({ result: "OK", data }, 200);
}

// 業務エラー。statusは 06_ErrorCode.md のコード対応表の値を渡す
// （入力値400 / 認証401 / 権限403 / 不存在404 / 業務ルール違反409）。
export function businessError(code: string, message: string, status: number): Response {
  return toResponse({ result: "NG", error: { code, message } }, status);
}

// システムエラー。常に500。
export function systemError(code: string, message: string): Response {
  return toResponse({ result: "FATAL", error: { code, message } }, 500);
}
