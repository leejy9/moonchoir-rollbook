import { describe, expect, it } from 'vitest';
import { prepareUploadBatch } from './uploadBatch';

describe('prepareUploadBatch (L2)', () => {
  function makeFile(name: string, size: number, type: string): File {
    const blob = new Blob(['x'.repeat(Math.min(size, 10))], { type });
    return new File([blob], name, { type });
  }

  it('accepts 3 valid audio files and strips extensions for titles', () => {
    const files = [
      makeFile('soprano_part.m4a', 1024 * 1024, 'audio/x-m4a'),
      makeFile('alto_part.mp3', 2 * 1024 * 1024, 'audio/mpeg'),
      makeFile('tenor_part.wav', 5 * 1024 * 1024, 'audio/wav'),
    ];

    const result = prepareUploadBatch(files, { kind: 'audio', allowCompress: true });

    expect(result.truncated).toBe(false);
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(3);
    expect(result.accepted[0].title).toBe('soprano_part');
    expect(result.accepted[1].title).toBe('alto_part');
    expect(result.accepted[2].title).toBe('tenor_part');
  });

  it('rejects unsupported audio type with reason: type', () => {
    const files = [
      makeFile('valid.m4a', 1024, 'audio/x-m4a'),
      makeFile('document.pdf', 1024, 'application/pdf'),
      makeFile('image.png', 1024, 'image/png'),
    ];

    const result = prepareUploadBatch(files, { kind: 'audio', allowCompress: true });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].title).toBe('valid');
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toBe('type');
    expect(result.rejected[0].file.name).toBe('document.pdf');
    expect(result.rejected[1].reason).toBe('type');
    expect(result.rejected[1].file.name).toBe('image.png');
  });

  it('rejects files exceeding 300MB with reason: size', () => {
    // 301MB file object (mock size via Object.defineProperty)
    const hugeFile = makeFile('huge.m4a', 10, 'audio/x-m4a');
    Object.defineProperty(hugeFile, 'size', { value: 301 * 1024 * 1024 });

    const normalFile = makeFile('normal.m4a', 10 * 1024 * 1024, 'audio/x-m4a');

    const result = prepareUploadBatch([normalFile, hugeFile], { kind: 'audio', allowCompress: true });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].title).toBe('normal');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('size');
    expect(result.rejected[0].file.name).toBe('huge.m4a');
  });

  it('truncates to first 20 items when more than 20 files are provided', () => {
    const files: File[] = [];
    for (let i = 1; i <= 25; i++) {
      files.push(makeFile(`track_${i}.m4a`, 1024, 'audio/x-m4a'));
    }

    const result = prepareUploadBatch(files, { kind: 'audio', allowCompress: true });

    expect(result.truncated).toBe(true);
    expect(result.accepted).toHaveLength(20);
    expect(result.accepted[0].title).toBe('track_1');
    expect(result.accepted[19].title).toBe('track_20');
  });

  it('falls back to full file name if name without extension is empty', () => {
    const file = makeFile('.m4a', 1024, 'audio/x-m4a');
    const result = prepareUploadBatch([file], { kind: 'audio', allowCompress: true });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].title).toBe('.m4a');
  });
});
