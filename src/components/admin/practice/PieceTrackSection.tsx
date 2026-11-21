import React from 'react';
import type { PracticeTrack } from '../../../types/rollbook';
import type { UploadJob } from '../../../services/media/uploadQueue';

interface PieceTrackSectionProps {
  tracks: PracticeTrack[];
  activeJob: UploadJob | null;
  pieceId: string;
  onOpenUpload: (previousStorageKey?: string) => void;
  onArchiveTrack: (track: PracticeTrack) => void;
  onOpenYoutubeModal: (track?: PracticeTrack) => void;
}

export const PieceTrackSection: React.FC<PieceTrackSectionProps> = ({
  tracks,
  activeJob,
  pieceId,
  onOpenUpload,
  onArchiveTrack,
  onOpenYoutubeModal,
}) => {
  const audioTracks = tracks.filter((t) => t.source === 'r2' || t.kind !== '참고영상');
  const youtubeTracks = tracks.filter((t) => t.source === 'youtube' || t.kind === '참고영상');

  return (
    <>
      <hr className="admin-section-divider" />

      {/* 음원 트랙 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label className="admin-field-label" style={{ margin: 0 }}>음원 목록</label>
        <button
          type="button"
          onClick={() => onOpenUpload()}
          style={{
            minHeight: '44px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--brand-primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 음원 올리기
        </button>
      </div>

      {audioTracks.length === 0 && !activeJob ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          등록된 음원이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {activeJob && activeJob.pieceId === pieceId && activeJob.kind === 'audio' && (
            <div style={{ padding: '8px 12px', background: 'var(--brand-primary-light)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>{activeJob.title}</span>
                <span>{activeJob.status === 'compressing' ? `압축 중 ${activeJob.progress}%` : `올리는 중 ${activeJob.progress}%`}</span>
              </div>
            </div>
          )}
          {audioTracks.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {t.kind}
                  {t.sizeBytes ? ` · ${(t.sizeBytes / (1024 * 1024)).toFixed(1)}MB` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => onOpenUpload(t.storageKey)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', fontSize: '12px' }}
                >
                  교체
                </button>
                <button
                  type="button"
                  onClick={() => onArchiveTrack(t)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', minWidth: '44px', minHeight: '44px', fontSize: '12px' }}
                >
                  보관
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="admin-section-divider" />

      {/* 유튜브 영상 링크 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label className="admin-field-label" style={{ margin: 0 }}>유튜브 참고 영상</label>
        <button
          type="button"
          onClick={() => onOpenYoutubeModal()}
          style={{
            minHeight: '44px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--brand-primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 유튜브 링크
        </button>
      </div>

      {youtubeTracks.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          등록된 영상 링크가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {youtubeTracks.map((yt) => (
            <div
              key={yt.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{yt.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {yt.url}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => onOpenYoutubeModal(yt)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', fontSize: '12px' }}
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => onArchiveTrack(yt)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', minWidth: '44px', minHeight: '44px', fontSize: '12px' }}
                >
                  보관
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
