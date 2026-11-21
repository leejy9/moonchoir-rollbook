import React, { useEffect, useState } from 'react';
import { sheetsService } from '../../services/sheets';
import type { AppConfig, PracticeCatalog, PracticePiece, PracticeTrack, ProgramCard } from '../../types/rollbook';
import { resolveTrackPlayback } from '../../utils/practiceMedia';

interface AdminPracticeTabProps {
  config: AppConfig;
  programCards: ProgramCard[];
  onDataChanged: () => void;
}

type SubSection = 'PIECES' | 'PROGRAMS';

const DEFAULT_KINDS = ['가이드', 'MR', '참고영상'];
const DEFAULT_SOURCES = ['r2', 'drive', 'youtube', 'external_url'];

export const AdminPracticeTab: React.FC<AdminPracticeTabProps> = ({
  config,
  programCards,
  onDataChanged,
}) => {
  const [subSection, setSubSection] = useState<SubSection>('PIECES');
  const [catalog, setCatalog] = useState<PracticeCatalog>(() => sheetsService.getPracticeCatalog());
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [showArchivedPieces, setShowArchivedPieces] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  // Piece Edit Modal
  const [editingPiece, setEditingPiece] = useState<Partial<PracticePiece> | null>(null);

  // Track Edit Modal
  const [editingTrack, setEditingTrack] = useState<Partial<PracticeTrack> | null>(null);
  const [customKind, setCustomKind] = useState('');
  const [customSource, setCustomSource] = useState('');

  // Program Card Selection for Season Assignment
  const activePrograms = programCards.filter((c) => !c.isArchived);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(activePrograms[0]?.id || '');

  const availableKinds = config.practiceTrackKinds?.length ? config.practiceTrackKinds : DEFAULT_KINDS;

  const reloadCatalog = async () => {
    setLoading(true);
    try {
      const refreshed = await sheetsService.refreshPracticeCatalog();
      setCatalog(refreshed);
    } catch (err: unknown) {
      setActionMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFeedback = (text: string, kind: 'success' | 'error' = 'success') => {
    setActionMsg({ kind, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  // --- Handlers for Pieces ---
  const handleSavePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPiece || !editingPiece.title?.trim()) {
      showFeedback('곡 제목을 입력해 주세요.', 'error');
      return;
    }

    try {
      await sheetsService.savePracticePiece({
        ...editingPiece,
        title: editingPiece.title.trim(),
      });
      setEditingPiece(null);
      await reloadCatalog();
      onDataChanged();
      showFeedback('연습곡이 저장되었습니다.');
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '연습곡 저장에 실패했습니다.', 'error');
    }
  };

  const handleToggleArchivePiece = async (piece: PracticePiece) => {
    try {
      await sheetsService.setPracticePieceArchived(piece.id, !piece.isArchived);
      await reloadCatalog();
      onDataChanged();
      showFeedback(piece.isArchived ? '연습곡이 복원되었습니다.' : '연습곡이 보관 처리되었습니다.');
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '상태 변경에 실패했습니다.', 'error');
    }
  };

  // --- Handlers for Tracks ---
  const handleOpenAddTrack = (pieceId: string) => {
    const existingCount = catalog.tracks.filter((t) => t.pieceId === pieceId).length;
    setEditingTrack({
      pieceId,
      label: '',
      kind: availableKinds[0] || '가이드',
      source: 'r2',
      storageKey: '',
      url: '',
      orderIndex: existingCount,
    });
    setCustomKind('');
    setCustomSource('');
  };

  const handleOpenEditTrack = (track: PracticeTrack) => {
    setEditingTrack({ ...track });
    if (!availableKinds.includes(track.kind)) {
      setCustomKind(track.kind);
    } else {
      setCustomKind('');
    }
    if (!DEFAULT_SOURCES.includes(track.source)) {
      setCustomSource(track.source);
    } else {
      setCustomSource('');
    }
  };

  const handleSaveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack || !editingTrack.pieceId || !editingTrack.label?.trim()) {
      showFeedback('트랙 라벨을 입력해 주세요.', 'error');
      return;
    }

    const finalKind = (customKind.trim() || editingTrack.kind || availableKinds[0] || '가이드').trim();
    const finalSource = (customSource.trim() || editingTrack.source || 'r2').trim();

    const isR2 = finalSource.toLowerCase() === 'r2';
    const storageKey = isR2 ? (editingTrack.storageKey || editingTrack.url || '').trim() : '';
    const url = isR2 ? '' : (editingTrack.url || '').trim();

    if (!isR2 && url && !url.startsWith('https://')) {
      showFeedback('https:// 주소만 저장할 수 있습니다.', 'error');
      return;
    }

    try {
      await sheetsService.savePracticeTrack({
        ...editingTrack,
        pieceId: editingTrack.pieceId,
        label: editingTrack.label.trim(),
        kind: finalKind,
        source: finalSource,
        storageKey,
        url,
      });
      setEditingTrack(null);
      await reloadCatalog();
      onDataChanged();
      showFeedback('트랙이 저장되었습니다.');
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '트랙 저장에 실패했습니다.', 'error');
    }
  };

  const handleToggleArchiveTrack = async (track: PracticeTrack) => {
    try {
      await sheetsService.setPracticeTrackArchived(track.id, !track.isArchived);
      await reloadCatalog();
      onDataChanged();
      showFeedback(track.isArchived ? '트랙이 복원되었습니다.' : '트랙이 보관 처리되었습니다.');
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '트랙 상태 변경에 실패했습니다.', 'error');
    }
  };

  const handleMoveTrackOrder = async (pieceId: string, trackId: string, direction: 'UP' | 'DOWN') => {
    const pieceTracks = catalog.tracks
      .filter((t) => t.pieceId === pieceId && !t.isArchived)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const idx = pieceTracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pieceTracks.length) return;

    const reordered = [...pieceTracks];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);

    try {
      await sheetsService.reorderPracticeTracks(
        pieceId,
        reordered.map((t) => t.id)
      );
      await reloadCatalog();
      onDataChanged();
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '순서 변경에 실패했습니다.', 'error');
    }
  };

  // --- Handlers for Program Pieces ---
  const selectedProgramLinks = catalog.programPieces
    .filter((pp) => pp.programId === selectedProgramId && !pp.isArchived)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const assignedPieceIds = selectedProgramLinks.map((pp) => pp.pieceId);

  const handleTogglePieceInProgram = async (pieceId: string) => {
    if (!selectedProgramId) return;
    let nextPieceIds: string[];
    if (assignedPieceIds.includes(pieceId)) {
      nextPieceIds = assignedPieceIds.filter((id) => id !== pieceId);
    } else {
      nextPieceIds = [...assignedPieceIds, pieceId];
    }

    try {
      await sheetsService.setProgramPieces(selectedProgramId, nextPieceIds);
      await reloadCatalog();
      onDataChanged();
      showFeedback('시즌 곡 목록이 저장되었습니다.');
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '저장에 실패했습니다.', 'error');
    }
  };

  const handleMoveProgramPiece = async (pieceId: string, direction: 'UP' | 'DOWN') => {
    if (!selectedProgramId) return;
    const idx = assignedPieceIds.indexOf(pieceId);
    if (idx < 0) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= assignedPieceIds.length) return;

    const nextIds = [...assignedPieceIds];
    const [moved] = nextIds.splice(idx, 1);
    nextIds.splice(targetIdx, 0, moved);

    try {
      await sheetsService.setProgramPieces(selectedProgramId, nextIds);
      await reloadCatalog();
      onDataChanged();
    } catch (err: unknown) {
      showFeedback(err instanceof Error ? err.message : '순서 변경에 실패했습니다.', 'error');
    }
  };

  // Pieces to display
  const displayedPieces = catalog.pieces
    .filter((p) => showArchivedPieces || !p.isArchived)
    .sort((a, b) => a.title.localeCompare(b.title));

  const selectedPiece = catalog.pieces.find((p) => p.id === selectedPieceId);
  const selectedPieceTracks = selectedPiece
    ? catalog.tracks
        .filter((t) => t.pieceId === selectedPiece.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  return (
    <div className="admin-practice-tab" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Notice */}
      <div
        className="admin-practice-notice"
        style={{
          padding: '12px 14px',
          background: 'var(--color-bg-subtle, #f5f5f5)',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--color-text-muted, #666)',
          borderLeft: '4px solid var(--color-primary, #0047ff)',
        }}
      >
        음원 파일은 Cloudflare R2에 직접 업로드한 뒤 파일 키를 입력해 주세요. 시판 음원은 유튜브 링크로 등록하세요.
      </div>

      {actionMsg && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: actionMsg.kind === 'error' ? 'var(--status-danger-light, #fee2e2)' : 'var(--status-success-light, #dcfce7)',
            color: actionMsg.kind === 'error' ? 'var(--status-danger, #b91c1c)' : 'var(--status-success, #15803d)',
          }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border, #eee)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setSubSection('PIECES')}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: subSection === 'PIECES' ? 'bold' : 'normal',
            backgroundColor: subSection === 'PIECES' ? 'var(--color-primary, #0047ff)' : 'var(--bg-subtle, #eee)',
            color: subSection === 'PIECES' ? 'var(--text-white, #fff)' : 'var(--text-main, #333)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          곡 및 트랙 관리
        </button>
        <button
          type="button"
          onClick={() => setSubSection('PROGRAMS')}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '8px 16px',
            borderRadius: '6px',
            fontWeight: subSection === 'PROGRAMS' ? 'bold' : 'normal',
            backgroundColor: subSection === 'PROGRAMS' ? 'var(--color-primary, #0047ff)' : 'var(--bg-subtle, #eee)',
            color: subSection === 'PROGRAMS' ? 'var(--text-white, #fff)' : 'var(--text-main, #333)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          시즌별 곡 순서
        </button>
        {loading && <span style={{ alignSelf: 'center', fontSize: '13px', color: 'var(--text-sub, #666)' }}>동기화 중...</span>}
      </div>

      {/* ============================================================== */}
      {/* SECTION 1: PIECES & TRACKS                                     */}
      {/* ============================================================== */}
      {subSection === 'PIECES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showArchivedPieces}
                onChange={(e) => setShowArchivedPieces(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              보관된 곡 포함
            </label>

            <button
              type="button"
              onClick={() => setEditingPiece({ title: '', composer: '', arranger: '', scoreUrl: '', notes: '' })}
              style={{
                minHeight: '44px',
                minWidth: '44px',
                padding: '8px 16px',
                backgroundColor: 'var(--color-primary, #0047ff)',
                color: 'var(--text-white, #fff)',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              새 연습곡 등록
            </button>
          </div>

          {/* Piece List Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {displayedPieces.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted, #888)', gridColumn: '1 / -1' }}>
                등록된 연습곡이 없습니다.
              </div>
            ) : (
              displayedPieces.map((piece) => {
                const isSelected = piece.id === selectedPieceId;
                const trackCount = catalog.tracks.filter((t) => t.pieceId === piece.id && !t.isArchived).length;
                return (
                  <div
                    key={piece.id}
                    style={{
                      border: isSelected ? '2px solid var(--color-primary, #0047ff)' : '1px solid var(--border-subtle, #ddd)',
                      borderRadius: '8px',
                      padding: '12px',
                      backgroundColor: piece.isArchived ? 'var(--bg-subtle, #f9f9f9)' : 'var(--bg-card, #fff)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                          {piece.title}
                          {piece.isArchived && (
                            <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted, #888)', background: 'var(--bg-subtle, #eee)', padding: '2px 6px', borderRadius: '4px' }}>
                              보관됨
                            </span>
                          )}
                        </div>
                        {(piece.composer || piece.arranger) && (
                          <div style={{ fontSize: '13px', color: 'var(--text-sub, #666)', marginTop: '2px' }}>
                            {[piece.composer && `작곡: ${piece.composer}`, piece.arranger && `편곡: ${piece.arranger}`]
                              .filter(Boolean)
                              .join(' / ')}
                          </div>
                        )}
                      </div>
                    </div>

                    {piece.scoreUrl && (
                      <div style={{ fontSize: '13px' }}>
                        <a href={piece.scoreUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary, #0047ff)' }}>
                          악보 링크 열기 ↗
                        </a>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-subtle, #eee)' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPieceId(isSelected ? null : piece.id)}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          flex: 1,
                          backgroundColor: isSelected ? 'var(--brand-primary, #333)' : 'var(--bg-subtle, #eee)',
                          color: isSelected ? 'var(--text-white, #fff)' : 'var(--text-main, #000)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        트랙 ({trackCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPiece(piece)}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          padding: '0 12px',
                          backgroundColor: 'var(--bg-subtle, #eee)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleArchivePiece(piece)}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          padding: '0 12px',
                          backgroundColor: 'var(--bg-subtle, #eee)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        {piece.isArchived ? '복원' : '보관'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Piece Tracks Detail Panel */}
          {selectedPiece && (
            <div
              style={{
                border: '2px solid var(--color-primary, #0047ff)',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: 'var(--bg-subtle, #fafafa)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>[{selectedPiece.title}] 음원 트랙 관리</h3>
                <button
                  type="button"
                  onClick={() => handleOpenAddTrack(selectedPiece.id)}
                  style={{
                    minHeight: '44px',
                    minWidth: '44px',
                    padding: '8px 14px',
                    backgroundColor: 'var(--color-primary, #0047ff)',
                    color: 'var(--text-white, #fff)',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  트랙 추가
                </button>
              </div>

              {selectedPieceTracks.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
                  등록된 음원 트랙이 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedPieceTracks.map((track, idx) => {
                    const playback = resolveTrackPlayback(track, config);
                    return (
                      <div
                        key={track.id}
                        style={{
                          border: '1px solid var(--border-subtle, #ddd)',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          backgroundColor: track.isArchived ? 'var(--bg-subtle, #f3f3f3)' : 'var(--bg-card, #fff)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Reorder Buttons */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            disabled={idx === 0 || track.isArchived}
                            onClick={() => void handleMoveTrackOrder(selectedPiece.id, track.id, 'UP')}
                            aria-label={`${track.label} 위로 이동`}
                            style={{
                              minHeight: '44px',
                              minWidth: '44px',
                              padding: '4px',
                              backgroundColor: 'var(--bg-subtle, #eee)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: idx === 0 || track.isArchived ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={idx === selectedPieceTracks.length - 1 || track.isArchived}
                            onClick={() => void handleMoveTrackOrder(selectedPiece.id, track.id, 'DOWN')}
                            aria-label={`${track.label} 아래로 이동`}
                            style={{
                              minHeight: '44px',
                              minWidth: '44px',
                              padding: '4px',
                              backgroundColor: 'var(--bg-subtle, #eee)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: idx === selectedPieceTracks.length - 1 || track.isArchived ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ▼
                          </button>
                        </div>

                        {/* Track Info */}
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                            {track.label}
                            {track.isArchived && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted, #888)', background: 'var(--bg-subtle, #eee)', padding: '1px 5px', borderRadius: '3px' }}>
                                보관됨
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-sub, #666)', marginTop: '2px', display: 'flex', gap: '6px' }}>
                            <span>종류: {track.kind || '미지정'}</span>
                            <span>•</span>
                            <span>출처: {track.source}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted, #888)', wordBreak: 'break-all', marginTop: '2px' }}>
                            {track.storageKey ? `키: ${track.storageKey}` : `주소: ${track.url || '없음'}`}
                          </div>
                        </div>

                        {/* Playback Badge */}
                        <div>
                          {playback.mode === 'audio' && (
                            <span style={{ fontSize: '12px', color: 'var(--status-success, #166534)', backgroundColor: 'var(--status-success-light, #dcfce7)', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                              인앱 재생 가능
                            </span>
                          )}
                          {playback.mode === 'external_link' && (
                            <span style={{ fontSize: '12px', color: 'var(--status-info, #1e40af)', backgroundColor: 'var(--status-info-light, #dbeafe)', padding: '4px 8px', borderRadius: '4px' }}>
                              외부 링크
                            </span>
                          )}
                          {playback.mode === 'unavailable' && (
                            <span style={{ fontSize: '12px', color: 'var(--status-danger, #991b1b)', backgroundColor: 'var(--status-danger-light, #fee2e2)', padding: '4px 8px', borderRadius: '4px' }} title={playback.reason}>
                              재생 불가
                            </span>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditTrack(track)}
                            style={{
                              minHeight: '44px',
                              minWidth: '44px',
                              padding: '0 10px',
                              backgroundColor: 'var(--bg-subtle, #eee)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleArchiveTrack(track)}
                            style={{
                              minHeight: '44px',
                              minWidth: '44px',
                              padding: '0 10px',
                              backgroundColor: 'var(--bg-subtle, #eee)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            {track.isArchived ? '복원' : '보관'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 2: SEASON PROGRAM PIECE ASSIGNMENT                     */}
      {/* ============================================================== */}
      {subSection === 'PROGRAMS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>시즌 카드 선택:</label>
            <select
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              style={{
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle, #ccc)',
                fontSize: '15px',
                width: '100%',
                maxWidth: '400px',
              }}
            >
              {activePrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.category})
                </option>
              ))}
            </select>
          </div>

          {selectedProgramId && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Left: Ordered list for this season */}
              <div style={{ border: '1px solid var(--border-subtle, #ddd)', borderRadius: '8px', padding: '14px', backgroundColor: 'var(--bg-card, #fff)' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>시즌 편성 곡 목록 (순서대로)</h4>
                {selectedProgramLinks.length === 0 ? (
                  <div style={{ color: 'var(--text-muted, #888)', fontSize: '13px' }}>선택된 곡이 없습니다. 오른쪽에서 곡을 추가하세요.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedProgramLinks.map((link, idx) => {
                      const piece = catalog.pieces.find((p) => p.id === link.pieceId);
                      if (!piece) return null;
                      return (
                        <div
                          key={piece.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: 'var(--bg-subtle, #f9f9f9)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle, #eee)',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 'bold', marginRight: '6px' }}>{idx + 1}.</span>
                            <span>{piece.title}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => void handleMoveProgramPiece(piece.id, 'UP')}
                              aria-label={`${piece.title} 위로 이동`}
                              style={{
                                minHeight: '44px',
                                minWidth: '44px',
                                backgroundColor: 'var(--bg-subtle, #eee)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              }}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedProgramLinks.length - 1}
                              onClick={() => void handleMoveProgramPiece(piece.id, 'DOWN')}
                              aria-label={`${piece.title} 아래로 이동`}
                              style={{
                                minHeight: '44px',
                                minWidth: '44px',
                                backgroundColor: 'var(--bg-subtle, #eee)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: idx === selectedProgramLinks.length - 1 ? 'not-allowed' : 'pointer',
                              }}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Checkbox list of all active pieces */}
              <div style={{ border: '1px solid var(--border-subtle, #ddd)', borderRadius: '8px', padding: '14px', backgroundColor: 'var(--bg-card, #fff)' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>곡 포함 여부 선택</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
                  {catalog.pieces
                    .filter((p) => !p.isArchived)
                    .map((p) => {
                      const isAssigned = assignedPieceIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 0',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => void handleTogglePieceInProgram(p.id)}
                            style={{ width: '20px', height: '20px' }}
                          />
                          <span>{p.title}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: Piece Create/Edit                                       */}
      {/* ============================================================== */}
      {editingPiece && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card, #fff)',
              borderRadius: '8px',
              padding: '20px',
              width: '100%',
              maxWidth: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px' }}>
              {editingPiece.id ? '연습곡 수정' : '새 연습곡 등록'}
            </h3>

            <form onSubmit={(e) => void handleSavePiece(e)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>곡 제목 *</label>
                <input
                  type="text"
                  required
                  value={editingPiece.title || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, title: e.target.value })}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>작곡가</label>
                <input
                  type="text"
                  value={editingPiece.composer || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, composer: e.target.value })}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>편곡자</label>
                <input
                  type="text"
                  value={editingPiece.arranger || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, arranger: e.target.value })}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>악보 링크 (https://)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={editingPiece.scoreUrl || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, scoreUrl: e.target.value })}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>메모</label>
                <textarea
                  rows={2}
                  value={editingPiece.notes || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingPiece(null)}
                  style={{
                    minHeight: '44px',
                    minWidth: '44px',
                    padding: '8px 16px',
                    backgroundColor: 'var(--bg-subtle, #eee)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  style={{
                    minHeight: '44px',
                    minWidth: '44px',
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary, #0047ff)',
                    color: 'var(--text-white, #fff)',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: Track Create/Edit & Live Preview                        */}
      {/* ============================================================== */}
      {editingTrack && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card, #fff)',
              borderRadius: '8px',
              padding: '20px',
              width: '100%',
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px' }}>
              {editingTrack.id ? '트랙 수정' : '새 트랙 추가'}
            </h3>

            <form onSubmit={(e) => void handleSaveTrack(e)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>트랙 라벨 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 전체 합창 가이드, 소프라노 파트, MR"
                  value={editingTrack.label || ''}
                  onChange={(e) => setEditingTrack({ ...editingTrack, label: e.target.value })}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>종류</label>
                <select
                  value={customKind ? '__custom__' : editingTrack.kind || availableKinds[0]}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomKind('직접입력');
                    } else {
                      setCustomKind('');
                      setEditingTrack({ ...editingTrack, kind: e.target.value });
                    }
                  }}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                >
                  {availableKinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  <option value="__custom__">직접 입력...</option>
                </select>
                {customKind !== '' && (
                  <input
                    type="text"
                    placeholder="종류 직접 입력"
                    value={customKind}
                    onChange={(e) => setCustomKind(e.target.value)}
                    style={{ width: '100%', minHeight: '44px', padding: '8px', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>출처</label>
                <select
                  value={customSource ? '__custom__' : editingTrack.source || 'r2'}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomSource('기타');
                    } else {
                      setCustomSource('');
                      setEditingTrack({ ...editingTrack, source: e.target.value });
                    }
                  }}
                  style={{ width: '100%', minHeight: '44px', padding: '8px', boxSizing: 'border-box' }}
                >
                  <option value="r2">r2 (Cloudflare R2 음원 스트리밍)</option>
                  <option value="drive">drive (구글 드라이브)</option>
                  <option value="youtube">youtube (유튜브 영상 링크)</option>
                  <option value="external_url">external_url (일반 웹 링크)</option>
                  <option value="__custom__">직접 입력...</option>
                </select>
                {customSource !== '' && (
                  <input
                    type="text"
                    placeholder="출처 직접 입력"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    style={{ width: '100%', minHeight: '44px', padding: '8px', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              {/* Path or URL Input based on Source */}
              {(() => {
                const currentSource = (customSource || editingTrack.source || 'r2').toLowerCase();
                const isR2 = currentSource === 'r2';
                const inputValue = isR2 ? editingTrack.storageKey || '' : editingTrack.url || '';

                // Live Preview Calculation
                const draftTrack: PracticeTrack = {
                  id: editingTrack.id || 'draft',
                  pieceId: editingTrack.pieceId || '',
                  label: editingTrack.label || '미리보기',
                  kind: (customKind || editingTrack.kind || '가이드').trim(),
                  source: currentSource,
                  storageKey: isR2 ? inputValue : '',
                  url: isR2 ? '' : inputValue,
                  orderIndex: editingTrack.orderIndex || 0,
                  isArchived: false,
                  createdAt: '',
                  updatedAt: '',
                };

                const playback = resolveTrackPlayback(draftTrack, config);
                const hasInsecureScheme =
                  inputValue.trim().startsWith('http://') || inputValue.trim().startsWith('javascript:');

                return (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                      {isR2 ? 'R2 파일 키 (경로) *' : '외부 링크 URL (https://) *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isR2 ? '예: audio/2026-fall/arirang.m4a' : 'https://...'}
                      value={inputValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (isR2) {
                          setEditingTrack({ ...editingTrack, storageKey: val, url: '' });
                        } else {
                          setEditingTrack({ ...editingTrack, url: val, storageKey: '' });
                        }
                      }}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px',
                        boxSizing: 'border-box',
                        borderColor: hasInsecureScheme ? 'var(--status-danger, #ef4444)' : 'var(--border-subtle, #ccc)',
                      }}
                    />

                    {/* Security warning on http:// */}
                    {hasInsecureScheme && (
                      <div style={{ color: 'var(--status-danger, #b91c1c)', fontSize: '12px', marginTop: '4px' }}>
                        https:// 주소만 저장할 수 있습니다. (http:// 및 javascript: 불가)
                      </div>
                    )}

                    {/* Live Playback Mode Banner */}
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        backgroundColor:
                          playback.mode === 'audio'
                            ? 'var(--status-success-light, #dcfce7)'
                            : playback.mode === 'external_link'
                              ? 'var(--status-info-light, #dbeafe)'
                              : 'var(--status-danger-light, #fee2e2)',
                        color:
                          playback.mode === 'audio'
                            ? 'var(--status-success, #166534)'
                            : playback.mode === 'external_link'
                              ? 'var(--status-info, #1e40af)'
                              : 'var(--status-danger, #991b1b)',
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>
                        재생 방식:{' '}
                        {playback.mode === 'audio'
                          ? '인앱 오디오 재생 가능 (화면 꺼짐 지원)'
                          : playback.mode === 'external_link'
                            ? '외부 링크로 새 창에서 열림'
                            : '재생 불가'}
                      </div>
                      {playback.src && (
                        <div style={{ fontSize: '11px', wordBreak: 'break-all' }}>주소: {playback.src}</div>
                      )}
                      {playback.reason && <div>사유: {playback.reason}</div>}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
                      <button
                        type="button"
                        onClick={() => setEditingTrack(null)}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          padding: '8px 16px',
                          backgroundColor: 'var(--bg-subtle, #eee)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={hasInsecureScheme}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          padding: '8px 16px',
                          backgroundColor: hasInsecureScheme ? 'var(--border-subtle, #ccc)' : 'var(--color-primary, #0047ff)',
                          color: 'var(--text-white, #fff)',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          cursor: hasInsecureScheme ? 'not-allowed' : 'pointer',
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
