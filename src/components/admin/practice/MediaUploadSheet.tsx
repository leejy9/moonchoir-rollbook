import React, { useState, useEffect } from 'react';
import type { AppConfig, MediaUsage } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { uploadQueue } from '../../../services/media/uploadQueue';
import { validateAudioFile, COMPRESSION_ERROR_MESSAGE } from '../../../services/media/audioCompress';
import { createUploadSaveFn } from '../../../services/media/uploadSave';
import { readAudioDuration } from '../../../services/media/audioMetadata';
import { formatStorageUsage } from '../../../utils/formatStorage';
import { prepareUploadBatch, type BatchItem, type BatchRejectedItem } from '../../../services/media/uploadBatch';
import { MediaBatchList } from './MediaBatchList';
import { TrackKindSelector } from './TrackKindSelector';

interface MediaUploadSheetProps {
  pieceId?: string;
  kind: 'audio' | 'score';
  previousStorageKey?: string;
  replaceTrackId?: string;
  config: AppConfig;
  onClose: () => void;
  onJobEnqueued?: () => void;
  onStageUpload?: (data: { file: File; title: string; trackKind?: string; durationSeconds?: number; kind: 'audio' | 'score' }) => void;
}

const AUDIO_ACCEPT =
  'audio/mp4,audio/x-m4a,audio/mpeg,audio/aac,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac,.m4a,.mp3,.aac,.wav,.aif,.aiff,.flac';
const SCORE_ACCEPT = 'application/pdf,.pdf';

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
    return sheetsService.getPracticeCatalog().tracks.find((t) => t.id === replaceTrackId);
  }, [replaceTrackId]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [rejectedItems, setRejectedItems] = useState<BatchRejectedItem[]>([]);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);

  const [title, setTitle] = useState(() => existingTrack?.label || '');
  const [trackKind, setTrackKind] = useState(() => (existingTrack && kinds.includes(existingTrack.kind) ? existingTrack.kind : '가이드'));
  const [customKind, setCustomKind] = useState(() => (existingTrack && !kinds.includes(existingTrack.kind) ? existingTrack.kind : ''));
  const [isCustomKind, setIsCustomKind] = useState(() => Boolean(existingTrack && !kinds.includes(existingTrack.kind)));

  const [mediaUsage, setMediaUsage] = useState<MediaUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const hasMediaStorage = Boolean(config.mediaPublicBaseUrl?.trim());

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Media usage fetch timeout')), 8000);
    });

    Promise.race([sheetsService.getMediaUsage(), timeoutPromise])
      .then((usage) => { if (!cancelled) setMediaUsage(usage); })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn('[MediaUploadSheet] Failed to get media usage:', err);
          setUsageError(true);
        }
      })
      .finally(() => { if (timeoutId !== undefined) clearTimeout(timeoutId); });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setFileError(null);

    if (kind === 'audio' && !replaceTrackId && files.length > 1) {
      const batch = prepareUploadBatch(files, { kind: 'audio' });
      setBatchItems(batch.accepted);
      setRejectedItems(batch.rejected);
      setIsTruncated(batch.truncated);
      setIsBatchMode(true);
      setSelectedFile(null);
      return;
    }

    setIsBatchMode(false);
    setBatchItems([]);
    setRejectedItems([]);
    setIsTruncated(false);

    const file = files[0];
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
    if (!title.trim()) setTitle(baseName);
  };

  const handleUpdateBatchTitle = (index: number, newTitle: string) => {
    setBatchItems((prev) => prev.map((item, i) => (i === index ? { ...item, title: newTitle } : item)));
  };

  const handleRemoveBatchItem = (index: number) => {
    setBatchItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && rejectedItems.length === 0) setIsBatchMode(false);
      return next;
    });
  };

  const handleRemoveRejectedItem = (index: number) => {
    setRejectedItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && batchItems.length === 0) setIsBatchMode(false);
      return next;
    });
  };

  const totalGB = (mediaUsage?.totalBytes ?? 0) / (1024 * 1024 * 1024);
  const isOverQuota = totalGB >= 9.5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalKind = isCustomKind ? customKind.trim() || '가이드' : trackKind;
    const baseUrl = config.mediaPublicBaseUrl || '';

    if (isBatchMode) {
      if (batchItems.length === 0) return;
      for (const item of batchItems) {
        const itemTitle = item.title.trim() || item.file.name;
        const durationSeconds = await readAudioDuration(item.file);
        if (onStageUpload) {
          onStageUpload({ file: item.file, title: itemTitle, trackKind: finalKind, durationSeconds, kind: 'audio' });
        } else if (pieceId) {
          uploadQueue.enqueue({
            pieceId,
            kind: 'audio',
            title: itemTitle,
            trackKind: finalKind,
            fileName: item.file.name,
            file: item.file,
            baseUrl,
            saveFn: createUploadSaveFn('audio', pieceId, itemTitle, finalKind, undefined, durationSeconds),
          });
        }
      }
      if (!onStageUpload && onJobEnqueued) onJobEnqueued();
      onClose();
      return;
    }

    if (!selectedFile) return;
    const finalTitle = title.trim() || selectedFile.name;
    const durationSeconds = kind === 'audio' ? await readAudioDuration(selectedFile) : undefined;

    if (onStageUpload) {
      onStageUpload({ file: selectedFile, title: finalTitle, trackKind: kind === 'audio' ? finalKind : undefined, durationSeconds, kind });
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

  const isSubmitDisabled = isBatchMode
    ? batchItems.length === 0 || isOverQuota || !hasMediaStorage
    : !selectedFile || isOverQuota || Boolean(fileError) || !hasMediaStorage;

  const acceptString = kind === 'audio' ? AUDIO_ACCEPT : SCORE_ACCEPT;
  const isMultiple = kind === 'audio' && !replaceTrackId;

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
            aria-label="닫기"
            style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {!selectedFile && !isBatchMode && (
            <div className="admin-field-group">
              <label className="admin-field-label">파일 선택</label>
              <input
                type="file"
                multiple={isMultiple}
                accept={acceptString}
                onChange={handleFileChange}
                className="admin-field-input"
                style={{ padding: '10px' }}
              />
              {fileError && <div className="admin-field-error">{fileError}</div>}
            </div>
          )}

          {selectedFile && !isBatchMode && (
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
                  }}
                >
                  다른 파일
                  <input
                    type="file"
                    multiple={isMultiple}
                    accept={acceptString}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          )}

          {isBatchMode && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                  선택된 파일 {batchItems.length}개
                </span>
                <label
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  다른 파일
                  <input type="file" multiple accept={AUDIO_ACCEPT} onChange={handleFileChange} style={{ display: 'none' }} />
                </label>
              </div>
              <MediaBatchList
                items={batchItems}
                rejected={rejectedItems}
                truncated={isTruncated}
                onUpdateTitle={handleUpdateBatchTitle}
                onRemoveItem={handleRemoveBatchItem}
                onRemoveRejected={handleRemoveRejectedItem}
              />
            </div>
          )}

          {!isBatchMode && (
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
          )}

          {kind === 'audio' && (
            <TrackKindSelector
              kinds={kinds}
              trackKind={trackKind}
              isCustomKind={isCustomKind}
              customKind={customKind}
              onSelectKind={(k) => {
                setTrackKind(k);
                setIsCustomKind(false);
              }}
              onSetCustomKind={(custom) => setIsCustomKind(custom)}
              onChangeCustomText={(val) => setCustomKind(val)}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            <span>저장 공간 사용량</span>
            <span style={{ fontWeight: 700, color: isOverQuota ? 'var(--status-danger)' : 'var(--text-main)' }}>
              {usageError
                ? '확인할 수 없음'
                : mediaUsage
                ? `${formatStorageUsage(mediaUsage.totalBytes)} / 10GB`
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
              disabled={isSubmitDisabled}
              style={{
                minHeight: '44px',
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--brand-primary)',
                color: 'var(--text-white, #ffffff)',
                fontWeight: 700,
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                opacity: isSubmitDisabled ? 0.45 : 1,
              }}
            >
              {isBatchMode ? `${batchItems.length}개 올리기` : '올리기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
