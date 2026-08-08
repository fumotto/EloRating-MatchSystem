// 業務エラー・システムエラーを表す例外（05_Frontend.md 12章）。
//
// ★invoke.ts から切り出してある。invoke.ts は lib/supabase.ts を読み込み、
//   その時点で VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を要求する。
//   ApiError を invoke.ts に置くと、この型を使うだけの純ロジック（utils/apiErrorCode.ts）と
//   その単体テストが、環境変数の無い場所で起動しなくなる。
//
// error.code のみを持ち回り、表示文言は utils/errorMessage.ts が決める。
export class ApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ApiError";
  }
}
