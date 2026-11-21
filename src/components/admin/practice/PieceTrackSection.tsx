import React, { useState } from 'react';
import type { PracticeTrack } from '../../../types/rollbook';
import type { UploadJob } from '../../../services/media/uploadQueue';
import { TrackEditModal } from './TrackEditModal';
import { TrackRow } from './TrackRow';

interface PieceTrackSectionProps {
  tracks: PracticeTrack[];
  archivedTracks?: PracticeTrack[];
  activeJob: UploadJob | null;
  pieceId: string;
  availableKinds?: string[];
  onOpenUpload: (previousStorageKey?: string, replaceTrackId?: string) => void;
  onArchiveTrack: (track: PracticeTrack) => void;
  onRestoreTrack?: (track: PracticeTrack) => void;
  onMoveTrackOrder?: (trackId: string, direction: 'UP' | 'DOWN') => void;
  onEditTrack?: (track: PracticeTrack, updates: { label?: string; kind?: string }) => void;
  onOpenYoutubeModal: (track?: PracticeTrack) => void;
}

export const PieceTrackSection: React.FC<PieceTrackSectionProps> = ({
  tracks,
  archivedTracks = [],
  activeJob,
  pieceId,
  availableKinds = ['가이드', '파트음원', 'MR', '참고영상'],
  onOpenUpload,
  onArchiveTrack,
  onRestoreTrack,
  onMoveTrackOrder,
  onEditTrack,
  onOpenYoutubeModal,
}) => {
  const [editingModal, setEditingModal] = useState<{
    track: PracticeTrack;
    mode: 'label' | 'kind';
  } | null>(null);

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
          {audioTracks.map((t, idx) => (
            <TrackRow
              key={t.id}
              track={t}
              index={idx}
              totalCount={audioTracks.length}
              onMoveTrackOrder={onMoveTrackOrder}
              onOpenUpload={onOpenUpload}
              onEditLabel={(track) => setEditingModal({ track, mode: 'label' })}
              onEditKind={(track) => setEditingModal({ track, mode: 'kind' })}
              onArchiveTrack={onArchiveTrack}
            />
          ))}
        </div>
      )}

      {/* 보관된 트랙 접힘 영역 */}
      {archivedTracks.length > 0 && (
        <details style={{ marginBottom: '12px' }}>
          <summary
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '8px 0',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            보관된 트랙 ({archivedTracks.length}개)
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {archivedTracks.map((at) => (
              <div
                key={at.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  fontSize: '13px',
                  opacity: 0.8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{at.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    {at.kind} · 보관됨
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRestoreTrack?.(at)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--brand-primary)',
                    minWidth: '44px',
                    minHeight: '44px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  복원
                </button>
              </div>
            ))}
          </div>
        </details>
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
          {youtubeTracks.map((yt, idx) => (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => onMoveTrackOrder?.(yt.id, 'UP')}
                  aria-label="위로 이동"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    color: idx === 0 ? 'var(--text-muted)' : 'var(--text-main)',
                    opacity: idx === 0 ? 0.3 : 1,
                    minWidth: '44px',
                    minHeight: '44px',
                    fontSize: '15px',
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  ↑
                </button>
                <div style={{ overflow: 'hidden' }}>
                  <span style={{ fontWeight: 600 }}>{yt.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    {yt.url}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
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

      {/* 트랙 이름 / 종류 수정 모달 */}
      {editingModal && (
        <TrackEditModal
          track={editingModal.track}
          mode={editingModal.mode}
          availableKinds={availableKinds}
          onClose={() => setEditingModal(null)}
          onSave={(updates) => onEditTrack?.(editingModal.track, updates)}
        />
      )}
    </>
  );
};
