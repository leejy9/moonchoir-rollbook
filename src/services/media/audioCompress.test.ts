import { describe, it, expect } from 'vitest';
import {
  canCompress,
  validateAudioFile,
  COMPRESSION_ERROR_MESSAGE,
  MAX_DIRECT_AUDIO_BYTES,
} from './audioCompress';

describe('audioCompress', () => {
  it('returns false for canCompress prior to Q1 approval', () => {
    expect(canCompress()).toBe(false);
  });

  describe('validateAudioFile', () => {
    it('accepts audio file <= 30MB with supported extension/mime', () => {
      const validM4a = { name: 'test.m4a', size: 10 * 1024 * 1024, type: 'audio/mp4' };
      expect(validateAudioFile(validM4a).ok).toBe(true);

      const validMp3 = { name: 'track.mp3', size: 25 * 1024 * 1024, type: 'audio/mpeg' };
      expect(validateAudioFile(validMp3).ok).toBe(true);

      const validAac = { name: 'track.aac', size: 1024, type: 'audio/aac' };
      expect(validateAudioFile(validAac).ok).toBe(true);
    });

    it('rejects files > 30MB with single error message', () => {
      const largeFile = {
        name: 'huge.m4a',
        size: MAX_DIRECT_AUDIO_BYTES + 1,
        type: 'audio/mp4',
      };
      const res = validateAudioFile(largeFile);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(COMPRESSION_ERROR_MESSAGE);
    });

    it('rejects unsupported extensions / mime types with single error message', () => {
      const wavFile = {
        name: 'recording.wav',
        size: 5 * 1024 * 1024,
        type: 'audio/wav',
      };
      const res = validateAudioFile(wavFile);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(COMPRESSION_ERROR_MESSAGE);

      const flacFile = {
        name: 'recording.flac',
        size: 5 * 1024 * 1024,
      };
      expect(validateAudioFile(flacFile).reason).toBe(COMPRESSION_ERROR_MESSAGE);
    });
  });
});
