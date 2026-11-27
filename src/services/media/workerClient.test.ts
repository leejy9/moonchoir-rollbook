import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFile, deleteObject } from './workerClient';
import * as adminSession from '../adminSession';

describe('workerClient', () => {
  beforeEach(() => {
    adminSession.clearAllAdminTokens();
    adminSession.setAdminToken('admin', 'mock-admin-token-1234567890123456');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteObject', () => {
    it('throws ADMIN_AUTH_REQUIRED and clears tokens if admin token is missing', async () => {
      adminSession.clearAllAdminTokens();
      await expect(deleteObject('key.mp3', 'https://media.worker.dev')).rejects.toThrow('ADMIN_AUTH_REQUIRED');
    });

    it('throws ADMIN_AUTH_REQUIRED and clears tokens on 401 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(deleteObject('key.mp3', 'https://media.worker.dev')).rejects.toThrow('ADMIN_AUTH_REQUIRED');
      expect(adminSession.getActiveAdminToken()).toBeNull();
    });

    it('calls fetch DELETE with X-Admin-Token and succeeds on 204', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 204,
        ok: true,
      });

      await expect(deleteObject('2026/audio/test.mp3', 'https://media.worker.dev')).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://media.worker.dev/object/2026%2Faudio%2Ftest.mp3',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'X-Admin-Token': 'mock-admin-token-1234567890123456' },
        })
      );
    });
  });

  describe('uploadFile', () => {
    it('rejects with ADMIN_AUTH_REQUIRED if no admin token', async () => {
      adminSession.clearAllAdminTokens();
      const blob = new Blob(['hello'], { type: 'audio/mp4' });
      await expect(uploadFile('audio', blob, undefined, 'https://media.worker.dev')).rejects.toThrow('ADMIN_AUTH_REQUIRED');
    });

    it('uses XMLHttpRequest to upload file and reports progress', async () => {
      class MockXHR {
        public upload = { onprogress: null as any };
        public status = 0;
        public responseText = '';
        public onload: any = null;
        public onerror: any = null;
        public ontimeout: any = null;

        public open = vi.fn();
        public setRequestHeader = vi.fn();
        public send = vi.fn(() => {
          if (this.upload && this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          }
          this.status = 201;
          this.responseText = JSON.stringify({ key: '2026/audio/mock.m4a', size: 100 });
          if (this.onload) this.onload();
        });
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR);

      const progressSpy = vi.fn();
      const blob = new Blob(['hello'], { type: 'audio/mp4' });

      const res = await uploadFile('audio', blob, progressSpy, 'https://media.worker.dev');

      expect(res).toEqual({ key: '2026/audio/mock.m4a', size: 100 });
      expect(progressSpy).toHaveBeenCalledWith(50);
    });

    it('includes HTTP status code in upload failure message (J2)', async () => {
      class FailingXHR {
        public upload = { onprogress: null as any };
        public status = 415;
        public responseText = 'Unsupported Media Type';
        public onload: any = null;
        public open = vi.fn();
        public setRequestHeader = vi.fn();
        public send = vi.fn(() => {
          if (this.onload) this.onload();
        });
      }

      vi.stubGlobal('XMLHttpRequest', FailingXHR);
      const blob = new Blob(['bad content'], { type: 'text/plain' });

      await expect(uploadFile('score', blob, undefined, 'https://media.worker.dev')).rejects.toThrow(
        'Upload failed (415)'
      );
    });
  });
});
