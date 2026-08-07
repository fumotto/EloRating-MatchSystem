// Zod スキーマは Feature 配下の schemas/ に置く（05_Frontend.md 14.4）。
// 検証規則の正本は 04_BackendInterface.md 9.2（チーム名は1〜30文字）。
// 画面側の検証は利便性のためのものであり、認可・整合性の保証はバックエンドが行う。
import { z } from "zod";

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(1, "チーム名を入力してください")
    .max(30, "チーム名は30文字以内で入力してください"),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
