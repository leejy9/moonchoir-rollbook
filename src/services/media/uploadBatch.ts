import { validateAudioFile } from './audioCompress';

export interface BatchItem {
  file: File;
  title: string;
}

export interface BatchRejectedItem {
  file: File;
  reason: 'type' | 'size';
}

export interface AcceptRule {
  maxCount?: number;
  maxSizeBytes?: number;
  kind?: 'audio' | 'score';
  allowCompress?: boolean;
}

export interface BatchResult {
  accepted: BatchItem[];
  rejected: BatchRejectedItem[];
  truncated: boolean;
}

const DEFAULT_MAX_COUNT = 20;
const DEFAULT_AUDIO_MAX_SIZE = 300 * 1024 * 1024; // 300MB

/**
 * Validates multiple files, strips extensions for default titles,
 * truncates to maxCount (20), and classifies rejections by 'type' | 'size'.
 */
export function prepareUploadBatch(files: File[], accept?: AcceptRule): BatchResult {
  const maxCount = accept?.maxCount ?? DEFAULT_MAX_COUNT;
  const maxSizeBytes = accept?.maxSizeBytes ?? DEFAULT_AUDIO_MAX_SIZE;
  const kind = accept?.kind ?? 'audio';

  const truncated = files.length > maxCount;
  const targetFiles = truncated ? files.slice(0, maxCount) : files;

  const accepted: BatchItem[] = [];
  const rejected: BatchRejectedItem[] = [];

  for (const file of targetFiles) {
    if (file.size > maxSizeBytes) {
      rejected.push({ file, reason: 'size' });
      continue;
    }

    if (kind === 'audio') {
      const val = validateAudioFile(
        { name: file.name, size: file.size, type: file.type },
        { allowCompress: accept?.allowCompress }
      );
      if (!val.ok) {
        rejected.push({ file, reason: 'type' });
        continue;
      }
    } else if (kind === 'score') {
      if (file.size > 20 * 1024 * 1024) {
        rejected.push({ file, reason: 'size' });
        continue;
      }
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        rejected.push({ file, reason: 'type' });
        continue;
      }
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
    const title = baseName || file.name;
    accepted.push({ file, title });
  }

  return {
    accepted,
    rejected,
    truncated,
  };
}
