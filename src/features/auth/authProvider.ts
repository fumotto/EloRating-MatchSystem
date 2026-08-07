// 認証プロバイダの定義（ADR-015 / ADR-022）。
//
// ★画面はプロバイダ名をハードコードしない（05_Frontend.md 7章）。
//   プロバイダ非依存の設計を維持するため、表示名も含めて本モジュールが唯一の出所である。
//   将来 Steam を追加する場合（13_FutureFeatures.md）はここへ足すだけで画面は変わらない。
import type { Provider } from "@supabase/supabase-js";

export interface AuthProviderDefinition {
  id: Provider;
  displayName: string;
}

// MVP の認証プロバイダは Discord（ADR-022）。
export const AUTH_PROVIDERS: readonly AuthProviderDefinition[] = [
  { id: "discord", displayName: "Discord" },
];

// authProvider（バックエンドが返す文字列）から表示名を引く。
export function providerDisplayName(authProvider: string | undefined): string {
  if (!authProvider) return "不明なプロバイダ";
  return AUTH_PROVIDERS.find((p) => p.id === authProvider)?.displayName ?? authProvider;
}
