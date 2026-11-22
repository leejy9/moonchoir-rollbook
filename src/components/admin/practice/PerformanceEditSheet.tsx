import React, { useState } from 'react';
import type { Performance } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { UnsavedChangesModal } from './UnsavedChangesModal';

interface PerformanceEditSheetProps {
  performance?: Performance | null;
  onClose: () => void;
  onSaved: () => void;
}

export const PerformanceEditSheet: React.FC<PerformanceEditSheetProps> = ({
  performance,
  onClose,
  onSaved,
}) => {
  const isNew = !performance || !performance.id;

  const [title, setTitle] = useState(performance?.title || '');
  const [date, setDate] = useState(performance?.performanceDate || '');
  const [venue, setVenue] = useState(performance?.venue || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const initialTitle = performance?.title || '';
  const initialDate = performance?.performanceDate || '';
  const initialVenue = performance?.venue || '';

  const hasUnsavedChanges =
    title !== initialTitle || date !== initialDate || venue !== initialVenue;

  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await sheetsService.savePerformance({
        id: isNew ? undefined : performance.id,
        title: title.trim(),
        performanceDate: date.trim(),
        venue: venue.trim(),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '공연 저장에 실패했습니다.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!performance || !performance.id || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await sheetsService.setPerformanceArchived(performance.id, !performance.isArchived);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '공연 보관 상태 변경에 실패했습니다.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={handleAttemptClose}>
      <div
        className="admin-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
            {isNew ? '새 공연 추가' : '공연 정보 편집'}
          </h3>
          <button
            type="button"
            onClick={handleAttemptClose}
            aria-label="닫기"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="admin-field-label">공연 이름 (필수)</label>
            <input
              type="text"
              className="admin-field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 제1회 정기연주회"
              maxLength={100}
            />
          </div>

          <div>
            <label className="admin-field-label">공연 날짜 (선택, 비워 두면 미정)</label>
            <input
              type="date"
              className="admin-field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="admin-field-label">공연 장소 (선택)</label>
            <input
              type="text"
              className="admin-field-input"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="예: 인천아트센터 콘서트홀"
              maxLength={100}
            />
          </div>

          {!isNew && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={handleToggleArchive}
                disabled={isSaving}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: performance?.isArchived ? 'var(--brand-primary)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  minHeight: '44px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {performance?.isArchived ? '공연 복원' : '공연 보관'}
              </button>
            </div>
          )}
        </div>

        {/* Footer with fixed Save Button */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {errorMessage && (
            <div style={{ color: 'var(--status-danger)', fontSize: '13px', textAlign: 'center' }}>
              {errorMessage}
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || isSaving}
            style={{
              height: '52px',
              minHeight: '52px',
              width: '100%',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: !title.trim() || isSaving ? 'var(--border-subtle)' : 'var(--brand-primary)',
              color: 'var(--text-white, #ffffff)',
              fontSize: '16px',
              fontWeight: 700,
              cursor: !title.trim() || isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSaving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {showConfirmClose && (
        <UnsavedChangesModal
          onConfirmClose={() => {
            setShowConfirmClose(false);
            onClose();
          }}
          onContinueEditing={() => setShowConfirmClose(false)}
        />
      )}
    </div>
  );
};
