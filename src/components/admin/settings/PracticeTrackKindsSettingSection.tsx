import React, { useState } from 'react';
import type { AppConfig } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { serializeConfigForSave } from '../../../services/configNormalize';

interface PracticeTrackKindsSettingSectionProps {
  config: AppConfig;
  onSaved?: () => void;
}

const DEFAULT_TRACK_KINDS = ['가이드', 'MR', '참고영상'];

export const PracticeTrackKindsSettingSection: React.FC<PracticeTrackKindsSettingSectionProps> = ({
  config,
  onSaved,
}) => {
  const initialKinds =
    config.practiceTrackKinds && config.practiceTrackKinds.length > 0
      ? config.practiceTrackKinds
      : DEFAULT_TRACK_KINDS;

  const [kinds, setKinds] = useState<string[]>(initialKinds);
  const [newKindInput, setNewKindInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddKind = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const trimmed = newKindInput.trim();
    if (!trimmed) {
      setErrorMsg('종류 이름을 입력해 주세요.');
      return;
    }
    if (kinds.includes(trimmed)) {
      setErrorMsg('이미 존재하는 트랙 종류입니다.');
      return;
    }
    if (kinds.length >= 10) {
      setErrorMsg('트랙 종류는 최대 10개까지 등록할 수 있습니다.');
      return;
    }
    setKinds([...kinds, trimmed]);
    setNewKindInput('');
  };

  const handleRemoveKind = (index: number) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (kinds.length <= 1) {
      setErrorMsg('트랙 종류는 최소 1개 이상 있어야 합니다.');
      return;
    }
    setKinds(kinds.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...kinds];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setKinds(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= kinds.length - 1) return;
    const next = [...kinds];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setKinds(next);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (kinds.length < 1 || kinds.length > 10) {
      setErrorMsg('트랙 종류는 1개 이상 10개 이하이어야 합니다.');
      return;
    }

    setIsSaving(true);
    try {
      await sheetsService.saveConfigConfirmed({
        practiceTrackKinds: serializeConfigForSave(kinds),
      });
      setSuccessMsg('트랙 종류가 저장되었습니다.');
      if (onSaved) onSaved();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="toss-section-card" style={{ padding: '20px', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700 }}>
        연습곡 트랙 종류 관리
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
        음원 및 영상 업로드 시 선택할 트랙 종류를 1개~10개까지 설정합니다.
      </p>

      {errorMsg && (
        <div style={{ color: 'var(--status-danger)', fontSize: '13px', marginBottom: '12px' }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ color: 'var(--brand-primary)', fontSize: '13px', marginBottom: '12px' }}>
          {successMsg}
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {kinds.map((k, idx) => (
          <div
            key={k}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              fontSize: '14px',
            }}
          >
            <span style={{ fontWeight: 600 }}>{idx + 1}. {k}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => handleMoveUp(idx)}
                aria-label={`${k} 위로 이동`}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  cursor: idx === 0 ? 'not-allowed' : 'pointer',
                  opacity: idx === 0 ? 0.3 : 1,
                }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === kinds.length - 1}
                onClick={() => handleMoveDown(idx)}
                aria-label={`${k} 아래로 이동`}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  cursor: idx === kinds.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: idx === kinds.length - 1 ? 0.3 : 1,
                }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleRemoveKind(idx)}
                aria-label={`${k} 삭제`}
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--status-danger)',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          className="admin-field-input"
          placeholder="새 트랙 종류 (예: 소프라노 MR)"
          value={newKindInput}
          onChange={(e) => setNewKindInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddKind();
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={handleAddKind}
          style={{
            minHeight: '44px',
            padding: '0 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          추가
        </button>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        style={{
          width: '100%',
          minHeight: '44px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--brand-primary)',
          color: 'var(--text-white, #ffffff)',
          fontWeight: 700,
          cursor: isSaving ? 'not-allowed' : 'pointer',
        }}
      >
        {isSaving ? '저장 중…' : '트랙 종류 저장'}
      </button>
    </div>
  );
};
