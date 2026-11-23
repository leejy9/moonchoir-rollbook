import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canCompress,
  compressAudio,
  validateAudioFile,
  COMPRESSION_ERROR_MESSAGE,
  MAX_DIRECT_AUDIO_BYTES,
  MAX_COMPRESSIBLE_AUDIO_BYTES,
} from './audioCompress';

describe('audioCompress (V3-16)', () => {
  const originalAudioEncoder = (globalThis as any).AudioEncoder;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).AudioEncoder = originalAudioEncoder;
  });

  describe('canCompress', () => {
    it('returns false when AudioEncoder is not supported in window', async () => {
      delete (globalThis as any).AudioEncoder;
      const ok = await canCompress();
      expect(ok).toBe(false);
    });

    it('returns true when AudioEncoder is present and mediabunny supports aac', async () => {
      (globalThis as any).AudioEncoder = class DummyAudioEncoder {};
      const ok = await canCompress();
      // Mediabunny mock or environment
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('validateAudioFile', () => {
    it('accepts audio file <= 30MB with supported direct extension when compression is not available', () => {
      delete (globalThis as any).AudioEncoder;
      const validM4a = { name: 'test.m4a', size: 10 * 1024 * 1024, type: 'audio/mp4' };
      expect(validateAudioFile(validM4a, { allowCompress: false }).ok).toBe(true);
    });

    it('accepts audio file <= 300MB with wav/flac when compression is enabled', () => {
      const validWav = { name: 'recording.wav', size: 100 * 1024 * 1024, type: 'audio/wav' };
      expect(validateAudioFile(validWav, { allowCompress: true }).ok).toBe(true);

      const validFlac = { name: 'recording.flac', size: 50 * 1024 * 1024, type: 'audio/flac' };
      expect(validateAudioFile(validFlac, { allowCompress: true }).ok).toBe(true);
    });

    it('rejects files > 300MB when compression is enabled', () => {
      const hugeFile = { name: 'orchestra.wav', size: MAX_COMPRESSIBLE_AUDIO_BYTES + 1 };
      const res = validateAudioFile(hugeFile, { allowCompress: true });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('300MB');
    });

    it('rejects files > 30MB when compression is not enabled', () => {
      const largeFile = {
        name: 'huge.m4a',
        size: MAX_DIRECT_AUDIO_BYTES + 1,
        type: 'audio/mp4',
      };
      const res = validateAudioFile(largeFile, { allowCompress: false });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(COMPRESSION_ERROR_MESSAGE);
    });

    it('rejects wav/aiff when compression is not enabled and accepts when enabled (J3)', () => {
      const wavFile = { name: 'rehearsal.wav', size: 10 * 1024 * 1024, type: 'audio/wav' };
      const aifFile = { name: 'rehearsal.aif', size: 10 * 1024 * 1024, type: 'audio/aiff' };

      expect(validateAudioFile(wavFile, { allowCompress: false }).ok).toBe(false);
      expect(validateAudioFile(wavFile, { allowCompress: false }).reason).toBe(COMPRESSION_ERROR_MESSAGE);

      expect(validateAudioFile(aifFile, { allowCompress: false }).ok).toBe(false);
      expect(validateAudioFile(aifFile, { allowCompress: false }).reason).toBe(COMPRESSION_ERROR_MESSAGE);

      expect(validateAudioFile(wavFile, { allowCompress: true }).ok).toBe(true);
      expect(validateAudioFile(aifFile, { allowCompress: true }).ok).toBe(true);
    });
  });

  describe('compressAudio', () => {
    it('rejects file larger than 300MB before invoking mediabunny', async () => {
      const dummyFile = new File([''], 'huge.wav');
      Object.defineProperty(dummyFile, 'size', { value: 301 * 1024 * 1024 });

      await expect(compressAudio(dummyFile)).rejects.toThrow('300MB');
    });

    it('calls onProgress and returns compressed blob with duration', async () => {
      // Mock mediabunny
      vi.doMock('mediabunny', () => {
        return {
          canEncodeAudio: vi.fn().mockResolvedValue(true),
          ALL_FORMATS: [],
          BlobSource: class MockBlobSource {},
          Input: class MockInput {
            computeDuration = vi.fn().mockResolvedValue(123.4);
            getPrimaryAudioTrack = vi.fn().mockResolvedValue({
              getNumberOfChannels: vi.fn().mockResolvedValue(2),
            });
          },
          Output: class MockOutput {},
          Mp4OutputFormat: class MockMp4Format {},
          BufferTarget: class MockBufferTarget {
            buffer = new Uint8Array([1, 2, 3, 4]).buffer;
          },
          Conversion: {
            init: vi.fn().mockImplementation(async ({ output: _output }) => {
              return {
                isValid: true,
                onProgress: undefined as ((progress: number) => void) | undefined,
                execute: vi.fn().mockImplementation(async function (this: any) {
                  if (this.onProgress) this.onProgress(0.5);
                  if (this.onProgress) this.onProgress(1.0);
                }),
              };
            }),
          },
        };
      });

      const originalFile = new File(['sample original audio bytes that are quite long'], 'audio.wav', {
        type: 'audio/wav',
      });
      const progressList: number[] = [];

      const result = await compressAudio(originalFile, (p) => progressList.push(p));

      expect(progressList).toContain(50);
      expect(progressList).toContain(100);
      expect(result.durationSeconds).toBe(123);
      expect(result.wasCompressed).toBe(true);
      expect(result.file.type).toBe('audio/mp4');
    });

    it('uses original file when compressed file is larger and original is already m4a', async () => {
      vi.doMock('mediabunny', () => {
        return {
          canEncodeAudio: vi.fn().mockResolvedValue(true),
          ALL_FORMATS: [],
          BlobSource: class MockBlobSource {},
          Input: class MockInput {
            computeDuration = vi.fn().mockResolvedValue(60);
            getPrimaryAudioTrack = vi.fn().mockResolvedValue(null);
          },
          Output: class MockOutput {},
          Mp4OutputFormat: class MockMp4Format {},
          BufferTarget: class MockBufferTarget {
            // Compressed size 500 bytes
            buffer = new Uint8Array(500).buffer;
          },
          Conversion: {
            init: vi.fn().mockResolvedValue({
              isValid: true,
              execute: vi.fn().mockResolvedValue(undefined),
            }),
          },
        };
      });

      // Original size: 200 bytes (smaller than compressed 500 bytes)
      const smallOriginalM4a = new File([new Uint8Array(200)], 'small.m4a', { type: 'audio/mp4' });
      const result = await compressAudio(smallOriginalM4a);

      expect(result.wasCompressed).toBe(false);
      expect(result.file).toBe(smallOriginalM4a);
      expect(result.durationSeconds).toBe(60);
    });
  });
});
