import React, { useState } from 'react';
import type { AppConfig } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';

interface MediaStorageSettingSectionProps {
  config: AppConfig;
  onSaved?: () => void;
}

export const MediaStorageSettingSection: React.FC<MediaStorageSettingSectionProps> = ({
  config,
  onSaved,
}) => {
  const [inputUrl, setInputUrl] = useState(config.mediaPublicBaseUrl || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = inputUrl.trim();
    let cleaned = '';
    if (trimmed) {
      if (!trimmed.startsWith('https://')) {
        setErrorMsg('주소는 https://로 시작해야 합니다.');
        return;
      }
      cleaned = trimmed.replace(/\/+$/, '');
    }

    setIsSaving(true);
    try {
      await sheetsService.saveConfigConfirmed({ mediaPublicBaseUrl: cleaned });
      setInputUrl(cleaned);
      setSuccessMsg('파일 저장소 주소가 저장되었습니다.');
      if (onSaved) onSaved();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginTop: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-white)' }}>
        파일 저장소 주소 설정
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
        악보와 음원 미디어를 제공하는 공개 R2/CDN 주소(mediaPublicBaseUrl)를 지정합니다.
      </p>

      {errorMsg && (
        <div style={{ color: 'var(--status-danger)', fontSize: '12.5px', marginBottom: '8px' }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ color: 'var(--status-success)', fontSize: '12.5px', marginBottom: '8px' }}>
          {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          type="url"
          placeholder="https://(이름).(계정).workers.dev"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          style={{
            flex: '1 1 280px',
            background: 'rgba(0, 0, 0, 0.3)',
            color: 'var(--text-white)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12.5px',
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            background: 'var(--brand-primary)',
            color: 'var(--text-white)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12.5px',
            fontWeight: 500,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            minHeight: '44px',
          }}
        >
          {isSaving ? '저장 중…' : '저장소 주소 저장'}
        </button>
      </div>
    </div>
  );
};
