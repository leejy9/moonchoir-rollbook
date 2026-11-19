import type { BackendActionResult, RemoteBackend, RemoteSnapshot } from './types';

export class GasBackend implements RemoteBackend {
  readonly kind = 'gas' as const;
  private readonly getDefaultUrl?: () => string | undefined;

  constructor(getDefaultUrl?: () => string | undefined) {
    this.getDefaultUrl = getDefaultUrl;
  }

  public async requestSnapshot(targetUrl?: string): Promise<RemoteSnapshot> {
    const url = targetUrl || (this.getDefaultUrl ? this.getDefaultUrl() : undefined);
    if (!url) {
      throw new Error('구글 시트 Web App URL이 설정되지 않았습니다.');
    }

    const fetchUrl = url.includes('?')
      ? `${url}&action=GET_INITIAL_DATA`
      : `${url}?action=GET_INITIAL_DATA`;

    const res = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`구글 시트 통신 오류 (HTTP ${res.status})`);
    }

    const json = (await res.json()) as { success: boolean; error?: string; data?: RemoteSnapshot };

    if (!json.success || !json.data) {
      throw new Error(json.error || '구글 시트 응답 형식이 올바르지 않습니다.');
    }
    return json.data;
  }

  public async callAction(
    action: string,
    payload: unknown,
    targetUrl?: string
  ): Promise<BackendActionResult> {
    const url = targetUrl || (this.getDefaultUrl ? this.getDefaultUrl() : undefined);
    if (!url) {
      return { success: false, message: '시트 Web App URL이 설정되지 않았습니다.' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ action, data: payload, payload }),
      });

      if (!res.ok) {
        return { success: false, message: `구글 시트 통신 오류 (HTTP ${res.status})` };
      }

      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        existingMemberId?: string;
        boundDeviceId?: string;
      };
      return {
        success: json.success === true,
        message:
          json.message ||
          json.error ||
          (json.success === true ? '저장 완료' : '시트 저장이 확인되지 않았습니다.'),
        existingMemberId: json.existingMemberId,
        boundDeviceId: json.boundDeviceId,
      };
    } catch (err) {
      console.error('[Sheets API] POST failed:', err);
      return { success: false, message: '시트 전송 실패' };
    }
  }
}
