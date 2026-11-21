import React, { useState } from 'react';
import type { AppConfig, PracticeCatalog, PracticePiece, PracticeTrack, ProgramCard } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';
import { useUploadQueue } from '../../../services/media/uploadQueue';
import { MediaUploadSheet } from './MediaUploadSheet';
import { YoutubeLinkModal } from './YoutubeLinkModal';
import { PieceTrackSection } from './PieceTrackSection';

interface PieceEditModalProps {
  piece: Partial<PracticePiece>;
  catalog: PracticeCatalog;
  programCards: ProgramCard[];
  config: AppConfig;
  onClose: () => void;
  onSaved: () => void;
}

export const PieceEditModal: React.FC<PieceEditModalProps> = ({
  piece,
  catalog,
  programCards,
  config,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState(piece.title || '');
  const [composer, setComposer] = useState(piece.composer || '');
  const [arranger, setArranger] = useState(piece.arranger || '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [uploadSheetTarget, setUploadSheetTarget] = useState<{
    kind: 'audio' | 'score';
    previousStorageKey?: string;
    replaceTrackId?: string;
  } | null>(null);

  const [showAddProgramModal, setShowAddProgramModal] = useState(false);
  const [youtubeModal, setYoutubeModal] = useState<{ id?: string; title: string; url: string } | null>(null);

  const { activeJob } = useUploadQueue();

  const handleAutoSave = async () => {
    if (!title.trim()) {
      setFieldError('곡 이름을 입력해 주세요.');
      return;
    }
    setFieldError(null);
    try {
      await sheetsService.savePracticePiece({
        ...piece,
        title: title.trim(),
        composer: composer.trim(),
        arranger: arranger.trim(),
      });
      onSaved();
    } catch (err: unknown) {
      setFieldError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  };

  const connectedPrograms = React.useMemo(() => {
    if (!piece.id) return [];
    return catalog.programPieces
      .filter((pp) => pp.pieceId === piece.id && !pp.isArchived)
      .map((pp) => {
        const prog = programCards.find((c) => c.id === pp.programId);
        return {
          programId: pp.programId,
          orderIndex: pp.orderIndex,
          title: prog?.title || pp.programId,
        };
      });
  }, [piece.id, catalog.programPieces, programCards]);

  const handleRemoveFromProgram = async (programId: string) => {
    if (!piece.id) return;
    const currentList = catalog.programPieces
      .filter((pp) => pp.programId === programId && !pp.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pp) => pp.pieceId);
    const updated = currentList.filter((id) => id !== piece.id);
    await sheetsService.setProgramPieces(programId, updated);
    onSaved();
  };

  const handleAddToProgram = async (programId: string) => {
    if (!piece.id) return;
    const currentList = catalog.programPieces
      .filter((pp) => pp.programId === programId && !pp.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((pp) => pp.pieceId);
    if (!currentList.includes(piece.id)) {
      currentList.push(piece.id);
    }
    await sheetsService.setProgramPieces(programId, currentList);
    setShowAddProgramModal(false);
    onSaved();
  };

  const pieceTracks = React.useMemo(() => {
    if (!piece.id) return [];
    return catalog.tracks
      .filter((t) => t.pieceId === piece.id && !t.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [piece.id, catalog.tracks]);

  const handleArchiveTrack = async (track: PracticeTrack) => {
    if (!track.id) return;
    await sheetsService.setPracticeTrackArchived(track.id, true);
    onSaved();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>곡 정보 편집</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
          >
            ×
          </button>
        </div>

        {/* 기본 정보 */}
        <div className="admin-field-group">
          <label className="admin-field-label">곡 이름 (필수)</label>
          <input
            type="text"
            className="admin-field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleAutoSave}
            placeholder="곡 이름을 입력해 주세요"
          />
          {fieldError && <div className="admin-field-error">{fieldError}</div>}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="admin-field-group" style={{ flex: 1 }}>
            <label className="admin-field-label">작곡가</label>
            <input
              type="text"
              className="admin-field-input"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onBlur={handleAutoSave}
              placeholder="작곡가"
            />
          </div>
          <div className="admin-field-group" style={{ flex: 1 }}>
            <label className="admin-field-label">편곡자</label>
            <input
              type="text"
              className="admin-field-input"
              value={arranger}
              onChange={(e) => setArranger(e.target.value)}
              onBlur={handleAutoSave}
              placeholder="편곡자"
            />
          </div>
        </div>

        {piece.id && (
          <>
            <hr className="admin-section-divider" />

            {/* 공연 연결 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="admin-field-label" style={{ margin: 0 }}>연결된 공연</label>
              <button
                type="button"
                onClick={() => setShowAddProgramModal(true)}
                style={{
                  minHeight: '44px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  color: 'var(--brand-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + 공연에 넣기
              </button>
            </div>
            {connectedPrograms.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                연결된 공연이 없습니다. (공연 미정)
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {connectedPrograms.map((cp) => (
                  <div
                    key={cp.programId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      fontSize: '13px',
                    }}
                  >
                    <span>{cp.title} · {cp.orderIndex + 1}번째</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromProgram(cp.programId)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', minWidth: '44px', minHeight: '44px', fontSize: '16px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <hr className="admin-section-divider" />

            {/* 악보 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="admin-field-label" style={{ margin: 0 }}>악보 (PDF)</label>
              <button
                type="button"
                onClick={() => setUploadSheetTarget({ kind: 'score', previousStorageKey: piece.scoreStorageKey })}
                style={{
                  minHeight: '44px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  color: 'var(--brand-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {piece.scoreStorageKey || piece.scoreUrl ? '교체' : '+ 악보 올리기'}
              </button>
            </div>
            {piece.scoreStorageKey ? (
              <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '12px' }}>
                <span>{piece.scoreStorageKey.split('/').pop()}</span>
                {piece.scoreSizeBytes && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    ({(piece.scoreSizeBytes / (1024 * 1024)).toFixed(1)}MB)
                  </span>
                )}
              </div>
            ) : piece.scoreUrl ? (
              <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: '12px' }}>
                <span>외부 링크: {piece.scoreUrl}</span>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                등록된 악보가 없습니다.
              </div>
            )}

            {/* 음원 및 영상 트랙 섹션 */}
            <PieceTrackSection
              tracks={pieceTracks}
              activeJob={activeJob}
              pieceId={piece.id}
              onOpenUpload={(prevKey, trackId) =>
                setUploadSheetTarget({ kind: 'audio', previousStorageKey: prevKey, replaceTrackId: trackId })
              }
              onArchiveTrack={handleArchiveTrack}
              onOpenYoutubeModal={(yt) => setYoutubeModal(yt ? { id: yt.id, title: yt.label, url: yt.url || '' } : { title: '', url: '' })}
            />
          </>
        )}
      </div>

      {/* 공연 선택 팝업 */}
      {showAddProgramModal && (
        <div className="admin-modal-backdrop" onClick={() => setShowAddProgramModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>공연에 추가</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {programCards
                .filter((p) => !p.isArchived)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddToProgram(p.id)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 14px',
                      textAlign: 'left',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {p.title}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 유튜브 링크 모달 */}
      {youtubeModal && piece.id && (
        <YoutubeLinkModal
          initialTitle={youtubeModal.title}
          initialUrl={youtubeModal.url}
          isEdit={Boolean(youtubeModal.id)}
          onClose={() => setYoutubeModal(null)}
          onSave={async (ytTitle, ytUrl) => {
            await sheetsService.savePracticeTrack({
              id: youtubeModal.id,
              pieceId: piece.id!,
              label: ytTitle,
              kind: '참고영상',
              source: 'youtube',
              url: ytUrl,
              orderIndex: pieceTracks.length,
            });
            onSaved();
          }}
        />
      )}

      {/* 업로드 시트 */}
      {uploadSheetTarget && piece.id && (
        <MediaUploadSheet
          pieceId={piece.id}
          kind={uploadSheetTarget.kind}
          previousStorageKey={uploadSheetTarget.previousStorageKey}
          replaceTrackId={uploadSheetTarget.replaceTrackId}
          config={config}
          onClose={() => setUploadSheetTarget(null)}
          onJobEnqueued={onSaved}
        />
      )}
    </div>
  );
};
