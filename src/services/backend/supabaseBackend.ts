import type { BackendActionResult, RemoteBackend, RemoteSnapshot } from './types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export class SupabaseBackend implements RemoteBackend {
  readonly kind = 'supabase' as const;
  private readonly config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = {
      url: config.url.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, ''),
      anonKey: config.anonKey,
    };
  }

  public getConfig(): SupabaseConfig {
    return { ...this.config };
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${this.config.anonKey}`,
      'Content-Type': 'application/json',
    };
  }

  public async requestSnapshot(): Promise<RemoteSnapshot> {
    const endpoint = `${this.config.url}/rest/v1/rpc/fn_get_initial_snapshot`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw new Error(`Supabase 통신 오류 (HTTP ${res.status})`);
    }

    const json = (await res.json()) as { success: boolean; error?: string; data?: RemoteSnapshot };
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Supabase 응답 형식이 올바르지 않습니다.');
    }
    return json.data;
  }

  public async callAction(action: string, payload: unknown): Promise<BackendActionResult> {
    const rpcName = this.mapActionToRpc(action);
    if (!rpcName) {
      return { success: false, message: `지원되지 않는 작업입니다: ${action}` };
    }

    try {
      const endpoint = `${this.config.url}/rest/v1/rpc/${rpcName}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.formatRpcBody(action, payload)),
      });

      if (!res.ok) {
        return { success: false, message: `Supabase 통신 오류 (HTTP ${res.status})` };
      }

      const json = (await res.json()) as BackendActionResult;
      return {
        success: json.success === true,
        message:
          json.message ||
          json.error ||
          (json.success === true ? '저장 완료' : '저장이 확인되지 않았습니다.'),
        existingMemberId: json.existingMemberId,
        boundDeviceId: json.boundDeviceId,
        data: json.data,
      };
    } catch (err) {
      console.error('[Supabase API] RPC call failed:', err);
      return { success: false, message: 'Supabase 서버 전송 실패' };
    }
  }

  private mapActionToRpc(action: string): string | null {
    switch (action) {
      case 'VERIFY_ADMIN_PIN':
        return 'fn_verify_admin_pin';
      case 'VERIFY_ON_SITE_PIN':
        return 'fn_verify_on_site_pin';
      case 'VERIFY_SUPER_ADMIN_PIN':
        return 'fn_verify_super_admin_pin';
      case 'GET_ADMIN_SECRETS':
        return 'fn_get_admin_secrets';
      case 'RECORD_ATTENDANCE':
      case 'SUBMIT_CHECKIN':
        return 'fn_record_attendance';
      case 'CLEAR_ATTENDANCE':
        return 'fn_clear_attendance';
      case 'ADD_COMMENT':
        return 'fn_add_comment';
      case 'EDIT_COMMENT':
        return 'fn_edit_comment';
      case 'DELETE_COMMENT':
        return 'fn_delete_comment';
      case 'SUBMIT_RSVP':
        return 'fn_submit_rsvp';
      case 'CANCEL_RSVP':
        return 'fn_cancel_rsvp';
      case 'REGISTER_AND_BIND_MEMBER':
        return 'fn_register_and_bind_member';
      case 'BIND_EXISTING_MEMBER':
        return 'fn_bind_existing_member';
      case 'REGISTER_MEMBER':
        return 'fn_register_member';
      case 'UPDATE_MEMBER':
        return 'fn_update_member';
      case 'ADD_MEMBER_HISTORY':
        return 'fn_add_member_history';
      case 'DELETE_MEMBER':
        return 'fn_delete_member';
      case 'MERGE_MEMBERS':
        return 'fn_merge_members';
      case 'CREATE_SCHEDULE':
      case 'REGISTER_SCHEDULE':
        return 'fn_create_schedule';
      case 'UPDATE_SCHEDULE':
        return 'fn_update_schedule';
      case 'DELETE_SCHEDULE':
        return 'fn_delete_schedule';
      case 'BATCH_DELETE_SCHEDULES':
        return 'fn_batch_delete_schedules';
      case 'BATCH_UPDATE_SCHEDULES':
        return 'fn_batch_update_schedules';
      case 'SAVE_LOCATION':
      case 'REGISTER_LOCATION':
        return 'fn_save_location';
      case 'DELETE_LOCATION':
        return 'fn_delete_location';
      case 'SAVE_PROGRAM_CARD':
        return 'fn_save_program_card';
      case 'DELETE_PROGRAM_CARD':
        return 'fn_delete_program_card';
      case 'SAVE_CONFIG':
        return 'fn_save_config';
      default:
        return null;
    }
  }

  private formatRpcBody(action: string, payload: unknown): Record<string, unknown> {
    if (
      action === 'VERIFY_ADMIN_PIN' ||
      action === 'VERIFY_ON_SITE_PIN' ||
      action === 'VERIFY_SUPER_ADMIN_PIN'
    ) {
      const pinObj =
        payload && typeof payload === 'object' && 'pin' in payload
          ? (payload as { pin: string })
          : { pin: String(payload || '') };
      return { p_pin: pinObj.pin };
    }
    if (action === 'GET_ADMIN_SECRETS') {
      return {};
    }
    if (action === 'SAVE_CONFIG') {
      const configObj =
        payload && typeof payload === 'object' && 'config' in payload
          ? (payload as { config: Record<string, unknown> }).config
          : payload;
      return { p_payload: configObj ?? {} };
    }
    return { p_payload: payload ?? {} };
  }
}
