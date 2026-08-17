// Backend Client（05_Frontend.md 3章）。管理操作はすべて Edge Function 経由である。
//
// ★画面側のガードは利便性のためであり、認可の保証はバックエンドが行う（5.3）。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  AdminBanTeamRequest,
  AdminBanTeamResponse,
  AdminUnbanTeamRequest,
  AdminUnbanTeamResponse,
  AuditLogEntry,
  SystemSettings,
  UpdateSystemSettingsRequest,
  UpdateSystemSettingsResponse,
} from "../types/api";

interface AuditLogRow {
  id: string;
  actor_profile_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export const adminClient = {
  banTeam(request: AdminBanTeamRequest): Promise<AdminBanTeamResponse> {
    return invoke<AdminBanTeamRequest, AdminBanTeamResponse>("admin-ban-team", request);
  },

  unbanTeam(request: AdminUnbanTeamRequest): Promise<AdminUnbanTeamResponse> {
    return invoke<AdminUnbanTeamRequest, AdminUnbanTeamResponse>("admin-unban-team", request);
  },

  updateSettings(request: UpdateSystemSettingsRequest): Promise<UpdateSystemSettingsResponse> {
    return invoke<UpdateSystemSettingsRequest, UpdateSystemSettingsResponse>(
      "admin-update-system-settings",
      request,
    );
  },

  // システム設定は一般利用者も参照できる。人数上限・期限の表示に必要である（TC-ADMIN-017）。
  async fetchSystemSettings(): Promise<SystemSettings> {
    const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).single();

    if (error) throw error;
    return data as SystemSettings;
  },

  // 監査ログの参照は管理者のみ。制限はRLSが行う（TC-ADMIN-054）。
  async fetchAuditLogs(limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return (data as AuditLogRow[]).map((row) => ({
      id: row.id,
      actorProfileId: row.actor_profile_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  },
};
