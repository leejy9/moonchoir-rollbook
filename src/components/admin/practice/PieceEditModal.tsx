import React, { useState, useMemo } from 'react';
import type { AppConfig, PracticeCatalog, PracticePiece, PracticeTrack, ProgramCard } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { useUploadQueue, uploadQueue } from '../../../services/media/uploadQueue';
import { saveNewPieceWithStagedMedia } from '../../../services/media/uploadSave';
import { executeDeletePracticeTrack } from '../../../services/practice/deleteFlow';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { MediaUploadSheet } from './MediaUploadSheet';
import { YoutubeLinkModal } from './YoutubeLinkModal';
import { PieceTrackSection, type StagedTrack } from './PieceTrackSection';
import { AddProgramModal } from './AddProgramModal';
import { PieceScoreSection } from './PieceScoreSection';
import { PieceBasicInfoSection } from './PieceBasicInfoSection';
import { ConnectedProgramsSection } from './ConnectedProgramsSection';
import { PieceSaveButton } from './PieceSaveButton';
import { PieceArchiveButton } from './PieceArchiveButton';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { PerformanceEditSheet } from './PerformanceEditSheet';

interface PieceEditModalProps {
  piece: Partial<PracticePiece>;
  catalog: PracticeCatalog;
  programCards?: ProgramCard[];
  config: AppConfig;
  onClose: () => void;
  onSaved: () => void;
}

export const PieceEditModal: React.FC<PieceEditModalProps> = ({
  piece: initialPiece,
  catalog,
  programCards = [],
  config,
  onClose,
  onSaved,
}) => {
  const [savedPiece, setSavedPiece] = useState<Partial<PracticePiece> | null>(null);
  const activePieceId = savedPiece?.id || initialPiece.id;
  const currentPiece = useMemo(() => {
    if (!activePieceId) return savedPiece || initialPiece;
    const latest = (catalog.pieces || []).find((p) => p.id === activePieceId);
    return latest || savedPiece || initialPiece;
  }, [activePieceId, catalog.pieces, savedPiece, initialPiece]);
  const isNew = !currentPiece.id;

  const [title, setTitle] = useState(initialPiece.title || '');
  const [composer, setComposer] = useState(initialPiece.composer || '');
  const [arranger, setArranger] = useState(initialPiece.arranger || '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [stagedScore, setStagedScore] = useState<{ file: File; name: string } | null>(null);
  const [stagedTracks, setStagedTracks] = useState<StagedTrack[]>([]);
  const [stagedPerformanceIds, setStagedPerformanceIds] = useState<string[]>([]);

  const [uploadSheetTarget, setUploadSheetTarget] = useState<{
    kind: 'audio' | 'score';
    previousStorageKey?: string;
    replaceTrackId?: string;
  } | null>(null);

  const [showAddProgramModal, setShowAddProgramModal] = useState(false);
  const [showNewPerformanceSheet, setShowNewPerformanceSheet] = useState(false);
  const [youtubeModal, setYoutubeModal] = useState<{ id?: string; title: string; url: string } | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [deleteTrackTarget, setDeleteTrackTarget] = useState<PracticeTrack | null>(null);
  const [isDeletingTrack, setIsDeletingTrack] = useState(false);
  const [deleteTrackError, setDeleteTrackError] = useState<string | null>(null);

  const handleConfirmDeleteTrack = async () => {
    if (!deleteTrackTarget) return;
    try {
      setIsDeletingTrack(true);
      setDeleteTrackError(null);
      await executeDeletePracticeTrack(deleteTrackTarget.id);
      setDeleteTrackTarget(null);
      onSaved();
    } catch (err: unknown) {
      setDeleteTrackError(err instanceof Error ? err.message : '트랙 삭제에 실패했습니다.');
    } finally {
      setIsDeletingTrack(false);
    }
  };

  const { activeJob, failedJobs, retryJob, dismissJob } = useUploadQueue();
  const hasMediaBaseUrl = Boolean(config.mediaPublicBaseUrl?.trim());

  const isDirty = useMemo(() => {
    return (
      title.trim() !== (initialPiece.title || '').trim() ||
      composer.trim() !== (initialPiece.composer || '').trim() ||
      arranger.trim() !== (initialPiece.arranger || '').trim() ||
      stagedScore !== null || stagedTracks.length > 0 || stagedPerformanceIds.length > 0
    );
  }, [title, composer, arranger, initialPiece, stagedScore, stagedTracks, stagedPerformanceIds]);

  const handleRequestClose = () => {
    if (isDirty) setShowConfirmClose(true);
    else onClose();
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldError('곡 이름을 입력해 주세요.');
      return;
    }
    setFieldError(null);
    setIsSaving(true);
    try {
      if (isNew) {
        const created = await saveNewPieceWithStagedMedia({
          title: trimmedTitle, composer: composer.trim(), arranger: arranger.trim(),
          stagedPerformanceIds, stagedTracks, stagedScore,
          baseUrl: config.mediaPublicBaseUrl || '',
          catalogPerformancePieces: catalog.performancePieces,
          enqueueFn: (req) => uploadQueue.enqueue(req),
        });
        setStagedScore(null);
        setStagedTracks([]);
        setStagedPerformanceIds([]);
        setSavedPiece(created);
        onSaved();
      } else {
        const updated = await sheetsService.savePracticePiece({
          ...currentPiece, title: trimmedTitle, composer: composer.trim(), arranger: arranger.trim(),
        });
        setSavedPiece(updated);
        onSaved();
      }
    } catch (err: unknown) {
      setFieldError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const connectedPerformances = useMemo(() => {
    const performances = catalog.performances || [];
    if (isNew) {
      return stagedPerformanceIds.map((id) => ({
        programId: id, orderIndex: 0, title: performances.find((p) => p.id === id)?.title || id, isStaged: true,
      }));
    }
    if (!currentPiece.id) return [];
    return (catalog.performancePieces || [])
      .filter((pp) => pp.pieceId === currentPiece.id && !pp.isArchived)
      .map((pp) => ({
        programId: pp.performanceId,
        orderIndex: pp.orderIndex ?? 0,
        title: performances.find((p) => p.id === pp.performanceId)?.title || pp.performanceId,
        isStaged: false,
      }));
  }, [isNew, stagedPerformanceIds, currentPiece.id, catalog.performancePieces, catalog.performances]);

  const handleRemoveFromPerformance = async (perfId: string) => {
    if (isNew) return setStagedPerformanceIds((prev) => prev.filter((id) => id !== perfId));
    if (!currentPiece.id) return;
    const currentList = (catalog.performancePieces || [])
      .filter((pp) => pp.performanceId === perfId && !pp.isArchived)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((pp) => pp.pieceId);
    await sheetsService.setPerformancePieces(perfId, currentList.filter((id) => id !== currentPiece.id));
    onSaved();
  };

  const handleAddToPerformance = async (perfId: string) => {
    if (isNew) {
      setStagedPerformanceIds((prev) => (prev.includes(perfId) ? prev : [...prev, perfId]));
      setShowAddProgramModal(false);
      return;
    }
    if (!currentPiece.id) return;
    const currentList = (catalog.performancePieces || [])
      .filter((pp) => pp.performanceId === perfId && !pp.isArchived)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((pp) => pp.pieceId);
    if (!currentList.includes(currentPiece.id)) currentList.push(currentPiece.id);
    await sheetsService.setPerformancePieces(perfId, currentList);
    setShowAddProgramModal(false);
    onSaved();
  };

  const { pieceTracks, archivedTracks } = useMemo(() => {
    if (!currentPiece.id) return { pieceTracks: [], archivedTracks: [] };
    const all = (catalog.tracks || []).filter((t) => t.pieceId === currentPiece.id);
    return {
      pieceTracks: all.filter((t) => !t.isArchived).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
      archivedTracks: all.filter((t) => t.isArchived).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    };
  }, [currentPiece.id, catalog.tracks]);

  const handleMoveTrackOrder = async (trackId: string, direction: 'UP' | 'DOWN') => {
    if (!currentPiece.id) return;
    const idx = pieceTracks.findIndex((t) => t.id === trackId);
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= pieceTracks.length) return;
    const reordered = [...pieceTracks];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);
    await sheetsService.reorderPracticeTracks(currentPiece.id, reordered.map((t) => t.id));
    onSaved();
  };

  return (
    <div className="admin-modal-backdrop" onClick={handleRequestClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
            {isNew ? '곡 추가' : '곡 정보 편집'}
          </h3>
          <button
            type="button"
            onClick={handleRequestClose}
            style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PieceBasicInfoSection
            title={title}
            composer={composer}
            arranger={arranger}
            onChangeTitle={setTitle}
            onChangeComposer={setComposer}
            onChangeArranger={setArranger}
          />

          <hr className="admin-section-divider" />

          <ConnectedProgramsSection
            connectedPrograms={connectedPerformances}
            onOpenAddModal={() => setShowAddProgramModal(true)}
            onRemoveProgram={handleRemoveFromPerformance}
          />

          <PieceScoreSection
            piece={currentPiece}
            stagedScore={stagedScore}
            failedJobs={failedJobs}
            onRetryJob={retryJob}
            onDismissJob={dismissJob}
            hasMediaBaseUrl={hasMediaBaseUrl}
            onOpenUpload={(prevKey) => setUploadSheetTarget({ kind: 'score', previousStorageKey: prevKey })}
            onRemoveStagedScore={() => setStagedScore(null)}
          />

          <PieceTrackSection
            tracks={pieceTracks}
            archivedTracks={archivedTracks}
            stagedTracks={stagedTracks}
            failedJobs={failedJobs}
            onRetryJob={retryJob}
            onDismissJob={dismissJob}
            hasMediaBaseUrl={hasMediaBaseUrl}
            onRemoveStagedTrack={(id) => setStagedTracks((prev) => prev.filter((t) => t.id !== id))}
            activeJob={activeJob}
            pieceId={currentPiece.id}
            availableKinds={config.practiceTrackKinds}
            onOpenUpload={(prevKey, trackId) =>
              setUploadSheetTarget({ kind: 'audio', previousStorageKey: prevKey, replaceTrackId: trackId })
            }
            onArchiveTrack={async (track) => {
              if (track.id) {
                await sheetsService.setPracticeTrackArchived(track.id, true);
                onSaved();
              }
            }}
            onRestoreTrack={async (track) => {
              if (track.id) {
                await sheetsService.setPracticeTrackArchived(track.id, false);
                onSaved();
              }
            }}
            onMoveTrackOrder={handleMoveTrackOrder}
            onEditTrack={async (track, updates) => {
              const latestTrack = (catalog.tracks || []).find((t) => t.id === track.id);
              if (latestTrack) {
                await sheetsService.savePracticeTrack({ ...latestTrack, ...updates });
                onSaved();
              }
            }}
            onOpenYoutubeModal={(yt) => setYoutubeModal(yt ? { id: yt.id, title: yt.label, url: yt.url || '' } : { title: '', url: '' })}
            onDeleteTrack={(track) => setDeleteTrackTarget(track)}
          />

          <PieceArchiveButton piece={currentPiece} onSaved={onSaved} onClose={onClose} />
        </div>

        <PieceSaveButton
          disabled={!title.trim() || isSaving}
          isSaving={isSaving}
          fieldError={fieldError}
          onSave={handleSave}
        />
      </div>

      {showAddProgramModal && (
        <AddProgramModal
          performances={catalog.performances || []}
          programCards={programCards}
          onClose={() => setShowAddProgramModal(false)}
          onSelect={handleAddToPerformance}
          onAddNewPerformance={() => {
            setShowAddProgramModal(false);
            setShowNewPerformanceSheet(true);
          }}
        />
      )}

      {showNewPerformanceSheet && (
        <PerformanceEditSheet
          performance={null}
          onClose={() => setShowNewPerformanceSheet(false)}
          onSaved={() => {
            setShowNewPerformanceSheet(false);
            onSaved();
          }}
        />
      )}

      {youtubeModal && (
        <YoutubeLinkModal
          initialTitle={youtubeModal.title}
          initialUrl={youtubeModal.url}
          isEdit={Boolean(youtubeModal.id)}
          onClose={() => setYoutubeModal(null)}
          onSave={async (ytTitle, ytUrl) => {
            if (isNew) {
              setStagedTracks((prev) => [...prev, { id: `staged_yt_${Date.now()}`, kind: 'youtube', label: ytTitle, url: ytUrl }]);
            } else if (currentPiece.id) {
              await sheetsService.savePracticeTrack({
                id: youtubeModal.id,
                pieceId: currentPiece.id,
                label: ytTitle,
                kind: '참고영상',
                source: 'youtube',
                url: ytUrl,
                orderIndex: pieceTracks.length,
              });
              onSaved();
            }
          }}
        />
      )}

      {uploadSheetTarget && (
        <MediaUploadSheet
          pieceId={currentPiece.id}
          kind={uploadSheetTarget.kind}
          previousStorageKey={uploadSheetTarget.previousStorageKey}
          replaceTrackId={uploadSheetTarget.replaceTrackId}
          config={config}
          onClose={() => setUploadSheetTarget(null)}
          onJobEnqueued={onSaved}
          onStageUpload={isNew ? (staged) => {
            if (staged.kind === 'score') {
              setStagedScore({ file: staged.file, name: staged.title || staged.file.name });
            } else {
              setStagedTracks((prev) => [...prev, {
                id: `staged_${Date.now()}_${Math.random()}`,
                kind: 'audio',
                file: staged.file,
                label: staged.title,
                trackKind: staged.trackKind || '가이드',
                durationSeconds: staged.durationSeconds,
              }]);
            }
          } : undefined}
        />
      )}

      {showConfirmClose && (
        <UnsavedChangesModal
          onConfirmClose={onClose}
          onContinueEditing={() => setShowConfirmClose(false)}
        />
      )}

      {deleteTrackTarget && (
        <DeleteConfirmModal
          title={deleteTrackTarget.label || '트랙'}
          isDeleting={isDeletingTrack}
          errorMessage={deleteTrackError}
          onConfirm={handleConfirmDeleteTrack}
          onClose={() => {
            setDeleteTrackTarget(null);
            setDeleteTrackError(null);
          }}
        />
      )}
    </div>
  );
};
