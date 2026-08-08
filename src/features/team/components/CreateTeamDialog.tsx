// チーム作成フォーム（05_Frontend.md 14.4・14.6）。
// フォームは React Hook Form ＋ Zod。確認ダイアログは不要（14.6 のとおりフォームで代替）。
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTeamSchema, type CreateTeamInput } from "../schemas/createTeamSchema";
import { useCreateTeam } from "../hooks/useCreateTeam";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";

export function CreateTeamDialog() {
  const createTeam = useCreateTeam();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTeamInput>({ resolver: zodResolver(createTeamSchema) });

  const onSubmit = handleSubmit((input) => {
    createTeam.mutate(input, { onSuccess: () => reset() });
  });

  // 表示文言はエラーコードから引く（12章）。error.message を直接出さない。
  const failureCode = apiErrorCode(createTeam.error);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="team-name" className="block text-sm font-medium">
          チーム名
        </label>
        <input
          id="team-name"
          type="text"
          autoComplete="off"
          {...register("name")}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        {errors.name ? (
          <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      {failureCode ? <ErrorNotice code={failureCode} /> : null}

      <button
        type="submit"
        disabled={createTeam.isPending}
        className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {createTeam.isPending ? "作成中…" : "チームを作成"}
      </button>
    </form>
  );
}
