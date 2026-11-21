import React from 'react';
import type { PracticeTrack } from '../../../types/rollbook';

interface TrackRowProps {
  track: PracticeTrack;
  index: number;
  totalCount: number;
  onMoveTrackOrder?: (trackId: string, direction: 'UP' | 'DOWN') => void;
  onOpenUpload?: (storageKey?: string, trackId?: string) => void;
  onEditLabel: (track: PracticeTrack) => void;
  onEditKind: (track: PracticeTrack) => void;
  onArchiveTrack: (track: PracticeTrack) => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  totalCount,
  onMoveTrackOrder,
  onOpenUpload,
  onEditLabel,
  onEditKind,
  onArchiveTrack,
}) => {
  return (
    <div
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
          disabled={index === 0}
          onClick={() => onMoveTrackOrder?.(track.id, 'UP')}
          aria-label="위로 이동"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: index === 0 ? 'not-allowed' : 'pointer',
            color: index === 0 ? 'var(--text-muted)' : 'var(--text-main)',
            opacity: index === 0 ? 0.3 : 1,
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
          <span style={{ fontWeight: 600 }}>{track.label}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {track.kind}
            {track.sizeBytes ? ` · ${(track.sizeBytes / (1024 * 1024)).toFixed(1)}MB` : ''}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {onOpenUpload && (
          <button
            type="button"
            onClick={() => onOpenUpload(track.storageKey, track.id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--brand-primary)', minWidth: '44px', minHeight: '44px', fontSize: '12px' }}
          >
            교체
          </button>
        )}
        <details style={{ position: 'relative', display: 'inline-block' }}>
          <summary
            aria-label="더보기"
            style={{
              listStyle: 'none',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              userSelect: 'none',
            }}
          >
            ⋯
          </summary>
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              zIndex: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card)',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              minWidth: '120px',
            }}
          >
            <button
              type="button"
              disabled={index === totalCount - 1}
              onClick={(e) => {
                onMoveTrackOrder?.(track.id, 'DOWN');
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                padding: '8px 12px',
                minHeight: '44px',
                cursor: index === totalCount - 1 ? 'not-allowed' : 'pointer',
                color: index === totalCount - 1 ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: index === totalCount - 1 ? 0.4 : 1,
                fontSize: '13px',
              }}
            >
              아래로
            </button>
            <button
              type="button"
              onClick={(e) => {
                onEditLabel(track);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                padding: '8px 12px',
                minHeight: '44px',
                cursor: 'pointer',
                color: 'var(--text-main)',
                fontSize: '13px',
              }}
            >
              이름 바꾸기
            </button>
            <button
              type="button"
              onClick={(e) => {
                onEditKind(track);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                padding: '8px 12px',
                minHeight: '44px',
                cursor: 'pointer',
                color: 'var(--text-main)',
                fontSize: '13px',
              }}
            >
              종류 바꾸기
            </button>
            <button
              type="button"
              onClick={(e) => {
                onArchiveTrack(track);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                padding: '8px 12px',
                minHeight: '44px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              보관
            </button>
          </div>
        </details>
      </div>
    </div>
  );
};
