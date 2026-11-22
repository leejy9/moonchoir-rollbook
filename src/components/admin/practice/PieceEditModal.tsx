import React, { useState, useMemo } from 'react';
import type { AppConfig, PracticeCatalog, PracticePiece, ProgramCard } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { useUploadQueue, uploadQueue } from '../../../services/media/uploadQueue';
import { saveNewPieceWithStagedMedia } from '../../../services/media/uploadSave';
import { MediaUploadSheet } from './MediaUploadSheet';
import { YoutubeLinkModal } from './YoutubeLinkModal';
import { PieceTrackSection, type StagedTrack } from './PieceTrackSection';
import { AddProgramModal } from './AddProgramModal';
import { PieceScoreSection } from './PieceScoreSection';
import { PieceBasicInfoSection } from './PieceBasicInfoSection';
import { ConnectedProgramsSection } from './ConnectedProgramsSection';
import { PieceSaveButton } from './PieceSaveButton';
import { UnsavedChangesModal } from './UnsavedChangesModal';

interface PieceEditModalProps {
  piece: Partial<PracticePiece>;
  catalog: PracticeCatalog;
  programCards: ProgramCard[];
  config: AppConfig;
  onClose: () => void;
  onSaved: () => void;
}

export const PieceEditModal: React.FC<PieceEditModalProps> = ({
  piece: initialPiece,
  catalog,
  programCards,
  config,
  onClose,
  onSaved,
}) => {
  const [currentPiece, setCurrentPiece] = useState<Partial<PracticePiece>>(initialPiece);
  const isNew = !currentPiece.id;

  const [title, setTitle] = useState(initialPiece.title || '');
  const [composer, setComposer] = useState(initialPiece.composer || '');
  const [arranger, setArranger] = useState(initialPiece.arranger || '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [stagedScore, setStagedScore] = useState<{ file: File; name: string } | null>(null);
  const [stagedTracks, setStagedTracks] = useState<StagedTrack[]>([]);
  const [stagedProgramIds, setStagedProgramIds] = useState<string[]>([]);

  const [uploadSheetTarget, setUploadSheetTarget] = useState<{
    kind: 'audio' | 'score';
    previousStorageKey?: string;
    replaceTrackId?: string;
  } | null>(null);

  const [showAddProgramModal, setShowAddProgramModal] = useState(false);
  const [youtubeModal, setYoutubeModal] = useState<{ id?: string; title: string; url: string } | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const { activeJob } = useUploadQueue();

  const isDirty = useMemo(() => {
    if (title.trim() !== (initialPiece.title || '').trim()) return true;
    if (composer.trim() !== (initialPiece.composer || '').trim()) return true;
    if (arranger.trim() !== (initialPiece.arranger || '').trim()) return true;
    if (stagedScore !== null) return true;
    if (stagedTracks.length > 0) return true;
    if (stagedProgramIds.length > 0) return true;
    return false;
  }, [title, composer, arranger, initialPiece, stagedScore, stagedTracks, stagedProgramIds]);

  const handleRequestClose = () => {
    if (isDirty) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
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
          title: trimmedTitle,
          composer: composer.trim(),
          arranger: arranger.trim(),
          stagedProgramIds,
          stagedTracks,
          stagedScore,
          baseUrl: config.mediaPublicBaseUrl || '',
          catalogProgramPieces: catalog.programPieces,
          enqueueFn: (req) => uploadQueue.enqueue(req),
        });

        setStagedScore(null);
        setStagedTracks([]);
        setStagedProgramIds([]);
        setCurrentPiece(created);
        onSaved();
      } else {
        const updated = await sheetsService.savePracticePiece({
          ...currentPiece,
          title: trimmedTitle,
          composer: composer.trim(),
          arranger: arranger.trim(),
        });
        setCurrentPiece(updated);
        onSaved();
      }
    } catch (err: unknown) {
      setFieldError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const connectedPrograms = useMemo(() => {
    if (isNew) {
      return stagedProgramIds.map((progId) => {
        const prog = programCards.find((c) => c.id === progId);
        return {
          programId: progId,
          orderIndex: 0,
          title: prog?.title || progId,
          isStaged: true,
        };
      });
    }
    if (!currentPiece.id) return [];
    return catalog.programPieces
      .filter((pp) => pp.pieceId === currentPiece.id && !pp.isArchived)
      .map((pp) => {
        const prog = programCards.find((c) => c.id === pp.programId);
        return {
          programId: pp.programId,
          orderIndex: pp.orderIndex,
          title: prog?.title || pp.programId,
          isStaged: false,
        };
      });
  }, [isNew, stagedProgramIds, currentPiece.id, catalog.programPieces, programCards]);

  const handleRemoveFromProgram = async (programId: string) => {
    if (isNew) {
      setStagedProgramIds((prev) => prev.filter((id) => id !== programId));
      return;
    }
    if (!currentPiece.id) return;
    const currentList = catalog.programPieces
      .filter((pp) => pp.programId === programId && !pp.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pp) => pp.pieceId);
    await sheetsService.setProgramPieces(programId, currentList.filter((id) => id !== currentPiece.id));
    onSaved();
  };

  const handleAddToProgram = async (programId: string) => {
    if (isNew) {
      setStagedProgramIds((prev) => (prev.includes(programId) ? prev : [...prev, programId]));
      setShowAddProgramModal(false);
      return;
    }
    if (!currentPiece.id) return;
    const currentList = catalog.programPieces
      .filter((pp) => pp.programId === programId && !pp.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pp) => pp.pieceId);
    if (!currentList.includes(currentPiece.id)) currentList.push(currentPiece.id);
    await sheetsService.setProgramPieces(programId, currentList);
    setShowAddProgramModal(false);
    onSaved();
  };

  const pieceTracks = useMemo(() => {
    if (!currentPiece.id) return [];
    return catalog.tracks
      .filter((t) => t.pieceId === currentPiece.id && !t.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [currentPiece.id, catalog.tracks]);

  const archivedTracks = useMemo(() => {
    if (!currentPiece.id) return [];
    return catalog.tracks
      .filter((t) => t.pieceId === currentPiece.id && t.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [currentPiece.id, catalog.tracks]);

  const handleMoveTrackOrder = async (trackId: string, direction: 'UP' | 'DOWN') => {
    if (!currentPiece.id) return;
    const idx = pieceTracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pieceTracks.length) return;
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
            connectedPrograms={connectedPrograms}
            onOpenAddModal={() => setShowAddProgramModal(true)}
            onRemoveProgram={handleRemoveFromProgram}
          />

          <PieceScoreSection
            piece={currentPiece}
            stagedScore={stagedScore}
            onOpenUpload={(prevKey) => setUploadSheetTarget({ kind: 'score', previousStorageKey: prevKey })}
            onRemoveStagedScore={() => setStagedScore(null)}
          />

          <PieceTrackSection
            tracks={pieceTracks}
            archivedTracks={archivedTracks}
            stagedTracks={stagedTracks}
            onRemoveStagedTrack={(id) => setStagedTracks((prev) => prev.filter((t) => t.id !== id))}
            activeJob={activeJob}
            pieceId={currentPiece.id}
            availableKinds={config.practiceTrackKinds}
            onOpenUpload={(prevKey, trackId) =>
              setUploadSheetTarget({ kind: 'audio', previousStorageKey: prevKey, replaceTrackId: trackId })
            }
            onArchiveTrack={async (track) => {
              if (!track.id) return;
              await sheetsService.setPracticeTrackArchived(track.id, true);
              onSaved();
            }}
            onRestoreTrack={async (track) => {
              if (!track.id) return;
              await sheetsService.setPracticeTrackArchived(track.id, false);
              onSaved();
            }}
            onMoveTrackOrder={handleMoveTrackOrder}
            onEditTrack={async (track, updates) => {
              const latestTrack = catalog.tracks.find((t) => t.id === track.id);
              if (!latestTrack) return;
              await sheetsService.savePracticeTrack({ ...latestTrack, ...updates });
              onSaved();
            }}
            onOpenYoutubeModal={(yt) => setYoutubeModal(yt ? { id: yt.id, title: yt.label, url: yt.url || '' } : { title: '', url: '' })}
          />

          {currentPiece.id && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={async () => {
                  if (!currentPiece.id) return;
                  await sheetsService.setPracticePieceArchived(currentPiece.id, !currentPiece.isArchived);
                  onSaved();
                  onClose();
                }}
                style={{
                  minHeight: '44px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  color: currentPiece.isArchived ? 'var(--brand-primary)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {currentPiece.isArchived ? '곡 복원' : '곡 보관'}
              </button>
            </div>
          )}
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
          programCards={programCards}
          onClose={() => setShowAddProgramModal(false)}
          onSelect={handleAddToProgram}
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
              setStagedTracks((prev) => [
                ...prev,
                { id: `staged_yt_${Date.now()}`, kind: 'youtube', label: ytTitle, url: ytUrl },
              ]);
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
          onStageUpload={
            isNew
              ? (staged) => {
                  if (staged.kind === 'score') {
                    setStagedScore({ file: staged.file, name: staged.title || staged.file.name });
                  } else {
                    setStagedTracks((prev) => [
                      ...prev,
                      {
                        id: `staged_${Date.now()}_${Math.random()}`,
                        kind: 'audio',
                        file: staged.file,
                        label: staged.title,
                        trackKind: staged.trackKind || '가이드',
                        durationSeconds: staged.durationSeconds,
                      },
                    ]);
                  }
                }
              : undefined
          }
        />
      )}

      {showConfirmClose && (
        <UnsavedChangesModal
          onConfirmClose={onClose}
          onContinueEditing={() => setShowConfirmClose(false)}
        />
      )}
    </div>
  );
};
