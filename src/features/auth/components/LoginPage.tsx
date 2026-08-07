// Page（05_Frontend.md 3.2）。
//
// ★プロバイダ名をハードコードしない（7章 / ADR-015）。
//   ボタンは features/auth/authProvider.ts の定義から生成する。
import { useLogin } from "../hooks/useLogin";

export function LoginPage() {
  const { providers, login, pendingProvider, message } = useLogin();

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">ログイン</h1>
      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => void login(provider.id)}
            disabled={pendingProvider !== null}
            className="w-full rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {pendingProvider === provider.id ? "接続中…" : `${provider.displayName} でログイン`}
          </button>
        ))}
      </div>
      {message ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
      <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
        ランキングの閲覧にログインは不要です。
      </p>
    </section>
  );
}
