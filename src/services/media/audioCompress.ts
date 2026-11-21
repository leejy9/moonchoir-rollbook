/**
 * Audio compression module for Moonchoir Rollbook v3.
 * Prior to Q1 approval, canCompress() returns false.
 */

export const COMPRESSION_ERROR_MESSAGE = '이 기기에서는 압축할 수 없어요';

export const MAX_DIRECT_AUDIO_BYTES = 30 * 1024 * 1024; // 30MB
export const MAX_SCORE_BYTES = 20 * 1024 * 1024; // 20MB

export const SUPPORTED_AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'aac']);
export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/aac',
]);

/**
 * 기기 및 브라우저 환경이 AAC 압축(WebCodecs / AudioEncoder)을 지원하는지 검사한다.
 * Q1 확정 전까지는 false를 반환하여 30MB 이하 원본 업로드 경로로 분기한다.
 */
export function canCompress(): boolean {
  return false;
}

export interface AudioValidationResult {
  ok: boolean;
  reason?: string;
  ext?: string;
  mimeType?: string;
}

/**
 * 업로드할 음원 파일의 크기와 형식을 검증한다.
 * 압축을 수행할 수 없는 환경에서는 30MB 이하 m4a/mp3/aac 파일만 허용된다.
 */
export function validateAudioFile(file: { name: string; size: number; type?: string }): AudioValidationResult {
  if (canCompress()) {
    return { ok: true };
  }

  // 압축 불가 경로: 30MB 이하 m4a/mp3/aac 필수
  if (file.size > MAX_DIRECT_AUDIO_BYTES || file.size <= 0) {
    return { ok: false, reason: COMPRESSION_ERROR_MESSAGE };
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  const isMimeValid = mime ? SUPPORTED_AUDIO_MIME_TYPES.has(mime) : false;
  const isExtValid = SUPPORTED_AUDIO_EXTENSIONS.has(ext);

  if (!isMimeValid && !isExtValid) {
    return { ok: false, reason: COMPRESSION_ERROR_MESSAGE };
  }

  return { ok: true, ext, mimeType: mime };
}
