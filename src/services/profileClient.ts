// Backend Client（05_Frontend.md 3章）。UI・状態を持たない。
import { invoke } from "./invoke";
import type { EnsureProfileRequest, EnsureProfileResponse } from "../types/api";

export const profileClient = {
  // ログイン後に必ず呼ぶ。プロフィールが無ければ作成される（04_BackendInterface.md 4.1）。
  ensureProfile(request: EnsureProfileRequest): Promise<EnsureProfileResponse> {
    return invoke<EnsureProfileRequest, EnsureProfileResponse>("ensure-profile", request);
  },
};
