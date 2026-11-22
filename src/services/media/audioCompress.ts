/**
 * Audio compression module for Moonchoir Rollbook v3.
 * Uses mediabunny dynamic import to encode audio to AAC-LC 64kbps M4A.
 */

export const COMPRESSION_ERROR_MESSAGE = '이 기기에서는 압축할 수 없어요';

export const MAX_COMPRESSIBLE_AUDIO_BYTES = 300 * 1024 * 1024; // 300MB
export const MAX_DIRECT_AUDIO_BYTES = 30 * 1024 * 1024; // 30MB
export const MAX_SCORE_BYTES = 20 * 1024 * 1024; // 20MB

export const SUPPORTED_COMPRESSIBLE_EXTENSIONS = new Set([
  'wav',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'aac',
]);

export const SUPPORTED_DIRECT_EXTENSIONS = new Set(['m4a', 'mp3', 'aac']);
export const SUPPORTED_DIRECT_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/aac',
]);

/**
 * Checks if the runtime supports WebCodecs AudioEncoder.
 */
export function isAudioEncoderSupportedSync(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).AudioEncoder !== 'undefined';
}

/**
 * Asynchronously checks if mediabunny can encode AAC in the current browser.
 */
export async function canCompress(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isAudioEncoderSupportedSync()) return false;
  try {
    const mb = await import('mediabunny');
    return await mb.canEncodeAudio('aac', {
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 64000,
    });
  } catch {
    return false;
  }
}

export interface AudioValidationResult {
  ok: boolean;
  reason?: string;
  ext?: string;
  mimeType?: string;
}

/**
 * Validates audio file size and format before uploading/compressing.
 */
export function validateAudioFile(
  file: { name: string; size: number; type?: string },
  opts?: { allowCompress?: boolean }
): AudioValidationResult {
  const allowCompress = opts?.allowCompress ?? isAudioEncoderSupportedSync();

  const fileName = 'name' in file ? (file as File).name : 'audio.m4a';
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();

  if (allowCompress) {
    if (file.size > MAX_COMPRESSIBLE_AUDIO_BYTES) {
      return { ok: false, reason: '파일 크기가 300MB를 초과하여 처리할 수 없습니다.' };
    }
    if (file.size <= 0) {
      return { ok: false, reason: '유효하지 않은 파일 크기입니다.' };
    }
    if (!SUPPORTED_COMPRESSIBLE_EXTENSIONS.has(ext)) {
      return { ok: false, reason: '지원하지 않는 음원 형식입니다. (wav, aiff, flac, m4a, mp3, aac 지원)' };
    }
    return { ok: true, ext, mimeType: mime };
  }

  // Non-compressible route: 30MB limit and direct formats only
  if (file.size > MAX_DIRECT_AUDIO_BYTES || file.size <= 0) {
    return { ok: false, reason: COMPRESSION_ERROR_MESSAGE };
  }

  const isMimeValid = mime ? SUPPORTED_DIRECT_MIME_TYPES.has(mime) : false;
  const isExtValid = SUPPORTED_DIRECT_EXTENSIONS.has(ext);

  if (!isMimeValid && !isExtValid) {
    return { ok: false, reason: COMPRESSION_ERROR_MESSAGE };
  }

  return { ok: true, ext, mimeType: mime };
}

export interface CompressionResult {
  file: Blob | File;
  durationSeconds?: number;
  wasCompressed: boolean;
  mimeType: string;
}

/**
 * Compresses an audio file using mediabunny.
 * Adheres to 64kbps AAC, 44.1kHz, mono/stereo rules, 300MB limit, and uses original if compressed is larger.
 */
export async function compressAudio(
  file: File | Blob,
  onProgress?: (progress: number) => void
): Promise<CompressionResult> {
  if (file.size > MAX_COMPRESSIBLE_AUDIO_BYTES) {
    throw new Error('파일 크기가 300MB를 초과하여 처리할 수 없습니다.');
  }

  const mb = await import('mediabunny');
  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    Conversion,
    canEncodeAudio,
  } = mb;

  const supported = await canEncodeAudio('aac', {
    numberOfChannels: 2,
    sampleRate: 44100,
    bitrate: 64000,
  });
  if (!supported) {
    throw new Error(COMPRESSION_ERROR_MESSAGE);
  }

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let durationSeconds: number | undefined;
  try {
    durationSeconds = await input.computeDuration();
  } catch (err) {
    console.warn('[audioCompress] computeDuration failed:', err);
  }

  let channels = 2;
  try {
    const primaryTrack = await input.getPrimaryAudioTrack();
    if (primaryTrack && typeof primaryTrack.getNumberOfChannels === 'function') {
      const ch = await primaryTrack.getNumberOfChannels();
      if (ch === 1) channels = 1;
    }
  } catch (err) {
    console.warn('[audioCompress] channel detection failed:', err);
  }

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: {
      codec: 'aac',
      bitrate: 64000,
      sampleRate: 44100,
      numberOfChannels: channels,
    },
  });

  if (!conversion.isValid) {
    console.warn('[audioCompress] conversion is not valid:', (conversion as any).discardedTracks);
    throw new Error(COMPRESSION_ERROR_MESSAGE);
  }

  if (onProgress) {
    conversion.onProgress = (progress: number) => onProgress(Math.round(progress * 100));
  }

  await conversion.execute();

  const compressedBlob = new Blob([target.buffer!], { type: 'audio/mp4' });

  // If compressed file is larger or equal to original, and original is already m4a/mp3/aac, keep original
  const fileName = 'name' in file ? (file as File).name : 'audio.m4a';
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const isDirectFormat = SUPPORTED_DIRECT_EXTENSIONS.has(ext);

  if (compressedBlob.size >= file.size && isDirectFormat) {
    return {
      file,
      durationSeconds: durationSeconds ? Math.round(durationSeconds) : undefined,
      wasCompressed: false,
      mimeType: file.type || 'audio/mp4',
    };
  }

  return {
    file: compressedBlob,
    durationSeconds: durationSeconds ? Math.round(durationSeconds) : undefined,
    wasCompressed: true,
    mimeType: 'audio/mp4',
  };
}
