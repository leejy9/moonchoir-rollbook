import { clearAllAdminTokens, getActiveAdminToken } from '../adminSession';

export interface WorkerUploadResult {
  key: string;
  size: number;
}

/**
 * Worker로 미디어 파일(음원/악보)을 업로드한다.
 * XHR을 사용하여 실제 업로드 전송 진행률(onProgress)을 수신한다.
 */
export function uploadFile(
  kind: 'audio' | 'score',
  file: Blob | File,
  onProgress?: (percent: number) => void,
  baseUrl?: string
): Promise<WorkerUploadResult> {
  return new Promise((resolve, reject) => {
    const adminToken = getActiveAdminToken();
    if (!adminToken) {
      clearAllAdminTokens();
      reject(new Error('ADMIN_AUTH_REQUIRED'));
      return;
    }

    const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBase) {
      reject(new Error('Worker base URL is not configured'));
      return;
    }

    const url = `${cleanBase}/upload?kind=${kind}`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    xhr.setRequestHeader('X-Admin-Token', adminToken);
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    } else if (kind === 'score') {
      xhr.setRequestHeader('Content-Type', 'application/pdf');
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText) as WorkerUploadResult;
          resolve(data);
        } catch {
          reject(new Error('Invalid response from media server'));
        }
      } else if (xhr.status === 401) {
        clearAllAdminTokens();
        reject(new Error('ADMIN_AUTH_REQUIRED'));
      } else {
        const errorText = xhr.responseText || `Upload failed with status ${xhr.status}`;
        reject(new Error(errorText));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during media upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Timeout during media upload'));
    };

    xhr.send(file);
  });
}

/**
 * Worker의 DELETE /object/{key}를 호출하여 R2 버킷의 객체를 삭제한다.
 */
export async function deleteObject(key: string, baseUrl?: string): Promise<void> {
  const adminToken = getActiveAdminToken();
  if (!adminToken) {
    clearAllAdminTokens();
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleanBase) {
    throw new Error('Worker base URL is not configured');
  }

  const url = `${cleanBase}/object/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Admin-Token': adminToken,
    },
  });

  if (res.status === 401) {
    clearAllAdminTokens();
    throw new Error('ADMIN_AUTH_REQUIRED');
  }

  if (res.status !== 204 && !res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(errorText || `Delete failed with status ${res.status}`);
  }
}
