import React, { useState } from 'react';
import { isValidYoutubeUrl } from '../../../utils/youtubeUrl';

interface YoutubeLinkModalProps {
  initialTitle?: string;
  initialUrl?: string;
  isEdit?: boolean;
  onClose: () => void;
  onSave: (title: string, url: string) => Promise<void>;
}

export const YoutubeLinkModal: React.FC<YoutubeLinkModalProps> = ({
  initialTitle = '',
  initialUrl = '',
  isEdit = false,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidYoutubeUrl(url)) return;
    await onSave(title.trim() || '참고영상', url.trim());
    onClose();
  };

  const isUrlValid = isValidYoutubeUrl(url);

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <h4 style={{ margin: '0 0 12px 0' }}>유튜브 링크 {isEdit ? '수정' : '추가'}</h4>
        <form onSubmit={handleSubmit}>
          <div className="admin-field-group">
            <label className="admin-field-label">영상 제목</label>
            <input
              type="text"
              className="admin-field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 참고 연주 영상"
            />
          </div>
          <div className="admin-field-group">
            <label className="admin-field-label">유튜브 URL (https 필수)</label>
            <input
              type="url"
              className="admin-field-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {!isUrlValid && url && (
              <div className="admin-field-error">
                올바른 유튜브 링크(https://youtube.com 또는 https://youtu.be)를 입력해 주세요.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!isUrlValid}
              style={{
                minHeight: '44px',
                padding: '8px 18px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--brand-primary)',
                color: 'var(--text-white, #ffffff)',
                fontWeight: 700,
                cursor: !isUrlValid ? 'not-allowed' : 'pointer',
                opacity: !isUrlValid ? 0.45 : 1,
              }}
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
