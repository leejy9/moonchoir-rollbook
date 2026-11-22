import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PieceScoreSection } from './PieceScoreSection';
import type { UploadJob } from '../../../services/media/uploadQueue';

describe('PieceScoreSection (V3-17, J2)', () => {
  const dummyPiece = {
    id: 'piece_1',
    title: '아리랑',
  };

  const failedScoreJob: UploadJob = {
    id: 'job_score_fail',
    kind: 'score',
    file: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) as File,
    pieceId: 'piece_1',
    title: '아리랑 악보.pdf',
    fileName: 'arirang.pdf',
    status: 'failed',
    progress: 0,
    error: 'Upload failed (415): Unsupported Media Type',
    createdAt: Date.now(),
    baseUrl: 'https://media.test.com',
    saveFn: vi.fn(),
  };

  it('renders failed score job with failure tag and action buttons', () => {
    const html = renderToString(
      <PieceScoreSection
        piece={dummyPiece}
        failedJobs={[failedScoreJob]}
        onOpenUpload={vi.fn()}
        onRetryJob={vi.fn()}
        onDismissJob={vi.fn()}
      />
    );

    expect(html).toContain('아리랑 악보.pdf');
    expect(html).toContain('실패');
    expect(html).toContain('다시 시도');
    expect(html).toContain('지우기');
  });

  it('ignores failed jobs belonging to other pieces or kinds', () => {
    const otherFailedJob: UploadJob = {
      ...failedScoreJob,
      id: 'job_other',
      pieceId: 'piece_2',
      title: '다른 곡 악보.pdf',
    };

    const audioFailedJob: UploadJob = {
      ...failedScoreJob,
      id: 'job_audio',
      kind: 'audio',
      title: '아리랑 음원.mp3',
    };

    const html = renderToString(
      <PieceScoreSection
        piece={dummyPiece}
        failedJobs={[otherFailedJob, audioFailedJob]}
        onOpenUpload={vi.fn()}
      />
    );

    expect(html).not.toContain('다른 곡 악보.pdf');
    expect(html).not.toContain('아리랑 음원.mp3');
    expect(html).not.toContain('실패');
  });
});
