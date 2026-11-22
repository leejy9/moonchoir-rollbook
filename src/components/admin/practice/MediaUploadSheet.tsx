import React, { useState, useEffect } from 'react';
import type { AppConfig, MediaUsage } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { uploadQueue } from '../../../services/media/uploadQueue';
import { validateAudioFile, COMPRESSION_ERROR_MESSAGE } from '../../../services/media/audioCompress';
import { createUploadSaveFn } from '../../../services/media/uploadSave';
import { readAudioDuration } from '../../../services/media/audioMetadata';

interface MediaUploadSheetProps {
  pieceId?: string;
  kind: 'audio' | 'score';
  previousStorageKey?: string;
  replaceTrackId?: string;
  config: AppConfig;
  onClose: () => void;
  onJobEnqueued?: () => void;
  onStageUpload?: (data: {
    file: File;
    title: string;
    trackKind?: string;
    durationSeconds?: number;
    kind: 'audio' | 'score';
  }) => void;
}

export const MediaUploadSheet: React.FC<MediaUploadSheetProps> = ({
  pieceId,
  kind,
  previousStorageKey,
  replaceTrackId,
  config,
  onClose,
  onJobEnqueued,
  onStageUpload,
}) => {
  const kinds = config.practiceTrackKinds?.length ? config.practiceTrackKinds : ['가이드', 'MR', '참고영상'];

  const existingTrack = React.useMemo(() => {
    if (!replaceTrackId) return undefined;
    const catalog = sheetsService.getPracticeCatalog();
    return catalog.tracks.find((t) => t.id === replaceTrackId);
  }, [replaceTrackId]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState(() => existingTrack?.label || '');
  const [trackKind, setTrackKind] = useState(() => {
    if (existingTrack && kinds.includes(existingTrack.kind)) {
      return existingTrack.kind;
    }
    return '가이드';
  });
  const [customKind, setCustomKind] = useState(() => {
    if (existingTrack && !kinds.includes(existingTrack.kind)) {
      return existingTrack.kind;
    }
    return '';
  });
  const [isCustomKind, setIsCustomKind] = useState(() => {
    return Boolean(existingTrack && !kinds.includes(existingTrack.kind));
  });
  const [mediaUsage, setMediaUsage] = useState<MediaUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const hasMediaStorage = Boolean(config.mediaPublicBaseUrl?.trim());

  useEffect(() => {
    let cancelled = false;
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Media usage fetch timeout')), 8000);
    });

    Promise.race([sheetsService.getMediaUsage(), timeoutPromise])
      .then((usage) => {
        if (!cancelled) setMediaUsage(usage);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn('[MediaUploadSheet] Failed to get media usage:', err);
          setUsageError(true);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    if (kind === 'audio') {
      const val = validateAudioFile({ name: file.name, size: file.size, type: file.type });
      if (!val.ok) {
        setFileError(val.reason || COMPRESSION_ERROR_MESSAGE);
        setSelectedFile(null);
        return;
      }
    } else if (kind === 'score') {
      if (file.size > 20 * 1024 * 1024) {
        setFileError('악보 파일은 20MB 이하의 PDF만 가능합니다.');
        setSelectedFile(null);
        return;
      }
    }

    setSelectedFile(file);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (!title.trim()) {
      setTitle(baseName);
    }
  };

  const totalGB = (mediaUsage?.totalBytes ?? 0) / (1024 * 1024 * 1024);
  const isOverQuota = totalGB >= 9.5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const finalTitle = title.trim() || selectedFile.name;
    const finalKind = isCustomKind ? (customKind.trim() || '가이드') : trackKind;
    const baseUrl = config.mediaPublicBaseUrl || '';

    const durationSeconds = kind === 'audio' ? await readAudioDuration(selectedFile) : undefined;

    if (onStageUpload) {
      onStageUpload({
        file: selectedFile,
        title: finalTitle,
        trackKind: kind === 'audio' ? finalKind : undefined,
        durationSeconds,
        kind,
      });
      onClose();
      return;
    }

    if (!pieceId) return;

    uploadQueue.enqueue({
      pieceId,
      kind,
      title: finalTitle,
      trackKind: kind === 'audio' ? finalKind : undefined,
      fileName: selectedFile.name,
      file: selectedFile,
      previousStorageKey,
      baseUrl,
      saveFn: createUploadSaveFn(kind, pieceId, finalTitle, finalKind, replaceTrackId, durationSeconds),
    });

    if (onJobEnqueued) onJobEnqueued();
    onClose();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
            {kind === 'audio' ? '음원 올리기' : '악보 올리기'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {!selectedFile ? (
            <div className="admin-field-group">
              <label className="admin-field-label">파일 선택</label>
              <input
                type="file"
                accept={kind === 'audio' ? 'audio/mp4,audio/x-m4a,audio/mpeg,audio/aac,.m4a,.mp3,.aac' : 'application/pdf,.pdf'}
                onChange={handleFileChange}
                className="admin-field-input"
                style={{ padding: '10px' }}
              />
              {fileError && <div className="admin-field-error">{fileError}</div>}
            </div>
          ) : (
            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
                <label
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-block',
                  }}
                >
                  다른 파일
                  <input
                    type="file"
                    accept={kind === 'audio' ? 'audio/mp4,audio/x-m4a,audio/mpeg,audio/aac,.m4a,.mp3,.aac' : 'application/pdf,.pdf'}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="admin-field-group">
            <label className="admin-field-label">{kind === 'audio' ? '트랙 이름' : '악보 이름'}</label>
            <input
              type="text"
              className="admin-field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 전체 파트 가이드"
            />
          </div>

          {kind === 'audio' && (
            <div className="admin-field-group">
              <label className="admin-field-label">트랙 종류</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setTrackKind(k);
                      setIsCustomKind(false);
                    }}
                    style={{
                      minHeight: '44px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      background: !isCustomKind && trackKind === k ? 'var(--brand-primary-light)' : 'var(--bg-card)',
                      color: !isCustomKind && trackKind === k ? 'var(--brand-primary)' : 'var(--text-main)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {k}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomKind(true)}
                  style={{
                    minHeight: '44px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: isCustomKind ? 'var(--brand-primary-light)' : 'var(--bg-card)',
                    color: isCustomKind ? 'var(--brand-primary)' : 'var(--text-main)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  직접
                </button>
              </div>
              {isCustomKind && (
                <input
                  type="text"
                  className="admin-field-input"
                  placeholder="종류 직접 입력"
                  value={customKind}
                  onChange={(e) => setCustomKind(e.target.value)}
                />
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            <span>저장 공간 사용량</span>
            <span style={{ fontWeight: 700, color: isOverQuota ? 'var(--status-danger)' : 'var(--text-main)' }}>
              {usageError
                ? '확인할 수 없음'
                : mediaUsage
                ? `${totalGB.toFixed(1)}GB / 10GB`
                : '계산 중...'}
            </span>
          </div>

          {!hasMediaStorage && (
            <div style={{ fontSize: '13px', color: 'var(--status-warning)', marginBottom: '12px' }}>
              파일 저장소가 아직 연결되지 않았어요
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isOverQuota || Boolean(fileError) || !hasMediaStorage}
              style={{
                minHeight: '44px',
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--brand-primary)',
                color: 'var(--text-white, #ffffff)',
                fontWeight: 700,
                cursor: (!selectedFile || isOverQuota || Boolean(fileError) || !hasMediaStorage) ? 'not-allowed' : 'pointer',
                opacity: (!selectedFile || isOverQuota || Boolean(fileError) || !hasMediaStorage) ? 0.45 : 1,
              }}
            >
              올리기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
