import React, { useState } from 'react';
import type { UploadJob } from '../../../services/media/uploadQueue';

interface FailedJobsListProps {
  failedJobs: UploadJob[];
  onRetryJob?: (id: string) => void;
  onDismissJob?: (id: string) => void;
}

export const FailedJobsList: React.FC<FailedJobsListProps> = ({
  failedJobs,
  onRetryJob,
  onDismissJob,
}) => {
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  if (failedJobs.length === 0) return null;

  return (
    <>
      {failedJobs.map((fj) => (
        <div
          key={fj.id}
          onClick={() => setExpandedErrorId(expandedErrorId === fj.id ? null : fj.id)}
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-danger-light)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{fj.title}</span>
              <span style={{ fontSize: '11px', color: 'var(--status-danger)', marginLeft: '8px', fontWeight: 700 }}>
                실패
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
              {fj.file && onRetryJob && (
                <button
                  type="button"
                  onClick={() => onRetryJob(fj.id)}
                  style={{
                    minHeight: '44px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  다시 시도
                </button>
              )}
              {onDismissJob && (
                <button
                  type="button"
                  onClick={() => onDismissJob(fj.id)}
                  style={{
                    minHeight: '44px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  지우기
                </button>
              )}
            </div>
          </div>
          {expandedErrorId === fj.id && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--status-danger)' }}>
              {fj.error?.includes('401') ? '다시 로그인해 주세요' : (fj.error || '업로드 실패')}
            </div>
          )}
        </div>
      ))}
    </>
  );
};
