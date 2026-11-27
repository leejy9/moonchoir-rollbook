import React from 'react';
import type { BatchItem, BatchRejectedItem } from '../../../services/media/uploadBatch';

export interface MediaBatchListProps {
  items: BatchItem[];
  rejected: BatchRejectedItem[];
  truncated: boolean;
  onUpdateTitle: (index: number, newTitle: string) => void;
  onRemoveItem: (index: number) => void;
  onRemoveRejected: (index: number) => void;
}

export const MediaBatchList: React.FC<MediaBatchListProps> = ({
  items,
  rejected,
  truncated,
  onUpdateTitle,
  onRemoveItem,
  onRemoveRejected,
}) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      {truncated && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--brand-primary-light)',
            color: 'var(--brand-primary)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            fontWeight: 700,
            marginBottom: '12px',
          }}
        >
          20개까지 올릴 수 있어요
        </div>
      )}

      <div style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '2px' }}>
        {items.map((item, idx) => (
          <div
            key={`item-${idx}`}
            style={{
              padding: '10px 12px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="admin-field-input"
                style={{ flex: 1, minHeight: '44px' }}
                value={item.title}
                onChange={(e) => onUpdateTitle(idx, e.target.value)}
                placeholder="트랙 이름"
                aria-label={`트랙 이름 (${idx + 1}번째)`}
              />
              <button
                type="button"
                onClick={() => onRemoveItem(idx)}
                aria-label="항목 제거"
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '20px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginTop: '4px',
                padding: '0 4px',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '220px',
                }}
              >
                {item.file.name}
              </span>
              <span>{`${(item.file.size / (1024 * 1024)).toFixed(1)} MB`}</span>
            </div>
          </div>
        ))}

        {rejected.map((rej, rIdx) => (
          <div
            key={`rej-${rIdx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '8px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--status-danger)',
                    color: 'var(--text-white, #ffffff)',
                  }}
                >
                  제외
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rej.file.name}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {`${(rej.file.size / (1024 * 1024)).toFixed(1)} MB`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemoveRejected(rIdx)}
              aria-label="제외 항목 제거"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                border: 'none',
                background: 'transparent',
                fontSize: '20px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
