import React from 'react';
import type { AppConfig, PracticeCatalog, PracticePiece, ProgramCard, Schedule } from '../../../types/rollbook';
import { ProgramScopeMenu } from '../../studio/ProgramScopeMenu';
import { buildProgramScopes, filterPiecesByScope, searchPieces } from '../../../utils/practiceScope';
import { getKSTDateString } from '../../../utils/date';
import { useUploadQueue } from '../../../services/media/uploadQueue';

interface PieceListSectionProps {
  catalog: PracticeCatalog;
  programCards: ProgramCard[];
  schedules?: Schedule[];
  config: AppConfig;
  currentScopeId: string;
  onSelectScope: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  onSelectPiece: (piece: PracticePiece) => void;
  onAddNewPiece: () => void;
}

export const PieceListSection: React.FC<PieceListSectionProps> = ({
  catalog,
  programCards,
  schedules = [],
  config,
  currentScopeId,
  onSelectScope,
  searchQuery,
  onSearchChange,
  showArchived,
  onToggleArchived,
  onSelectPiece,
  onAddNewPiece,
}) => {
  const { haltedJobs, dismissHaltedJob } = useUploadQueue();
  const [showHaltedList, setShowHaltedList] = React.useState(false);

  // 1. Program scopes
  const scopes = React.useMemo(() => {
    return buildProgramScopes(catalog, programCards, schedules, config, getKSTDateString());
  }, [catalog, programCards, schedules, config]);

  // 2. Filter pieces
  const filteredPieces = React.useMemo(() => {
    let pieces = catalog.pieces;
    if (!showArchived) {
      pieces = pieces.filter((p) => !p.isArchived);
    }
    const scoped = filterPiecesByScope(pieces, catalog.programPieces, currentScopeId);
    return searchPieces(scoped, programCards, catalog.programPieces, searchQuery || '');
  }, [catalog, showArchived, currentScopeId, programCards, searchQuery]);

  // Check if a piece is unassigned to any active program
  const unassignedPieceIds = React.useMemo(() => {
    const assigned = new Set(
      catalog.programPieces
        .filter((pp) => !pp.isArchived)
        .map((pp) => pp.pieceId)
    );
    return new Set(catalog.pieces.filter((p) => !assigned.has(p.id)).map((p) => p.id));
  }, [catalog]);

  return (
    <div className="piece-list-section">
      {haltedJobs.length > 0 && (
        <div className="halted-uploads-banner">
          <div>
            <span className="halted-uploads-text">
              멈춘 업로드 {haltedJobs.length}개
            </span>
            {showHaltedList && (
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '12px' }}>
                {haltedJobs.map((j) => (
                  <li key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                    <span>{j.title} ({j.fileName})</span>
                    <button
                      type="button"
                      onClick={() => dismissHaltedJob(j.id)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      × 닫기
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="halted-uploads-btn"
            onClick={() => setShowHaltedList(!showHaltedList)}
          >
            {showHaltedList ? '접기' : '펼치기'}
          </button>
        </div>
      )}

      <div className="piece-list-controls">
        <input
          type="search"
          className="piece-search-input"
          placeholder="곡 이름·작곡가·공연"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <ProgramScopeMenu
          scopes={scopes}
          selectedScopeId={currentScopeId}
          onSelectScope={onSelectScope}
        />

        <button
          type="button"
          className={`piece-archive-toggle-btn ${showArchived ? 'active' : ''}`}
          onClick={onToggleArchived}
        >
          {showArchived ? '보관함 닫기' : '보관함'}
        </button>
      </div>

      <div className="admin-piece-list">
        {filteredPieces.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            연습곡이 없습니다.
          </div>
        ) : (
          filteredPieces.map(({ piece, orderNumber }) => {
            const isUnassigned = unassignedPieceIds.has(piece.id);
            const pieceTracks = catalog.tracks.filter((t) => t.pieceId === piece.id && !t.isArchived);
            const audioCount = pieceTracks.filter((t) => t.source === 'r2' || t.kind !== '참고영상').length;
            const videoCount = pieceTracks.filter((t) => t.source === 'youtube' || t.kind === '참고영상').length;
            const hasScore = Boolean(piece.scoreStorageKey || piece.scoreUrl);

            return (
              <div
                key={piece.id}
                className="admin-piece-row"
                onClick={() => onSelectPiece(piece)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectPiece(piece);
                }}
              >
                <div className="admin-piece-info">
                  <div className="admin-piece-title-row">
                    {orderNumber !== undefined && (
                      <span style={{ color: 'var(--brand-primary)', fontWeight: 700, marginRight: '4px' }}>
                        {orderNumber}.
                      </span>
                    )}
                    <span className="admin-piece-title">{piece.title}</span>
                    {isUnassigned && <span className="unassigned-tag">공연 미정</span>}
                    {piece.isArchived && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        [보관됨]
                      </span>
                    )}
                  </div>
                  <div className="admin-piece-meta">
                    {piece.composer || piece.arranger
                      ? [piece.composer, piece.arranger ? `편곡 ${piece.arranger}` : ''].filter(Boolean).join(' · ')
                      : '작곡가 미상'}
                    {' · '}
                    {[
                      audioCount > 0 ? `음원 ${audioCount}` : '',
                      videoCount > 0 ? `영상 ${videoCount}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || (hasScore ? '' : '등록된 미디어 없음')}
                    {piece.scoreUrl && (
                      <>
                        {' · '}
                        <a
                          href={piece.scoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}
                        >
                          악보
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
                  ›
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        className="admin-fab-btn"
        onClick={onAddNewPiece}
        aria-label="새 연습곡 등록 (곡 추가)"
      >
        + 곡
      </button>
    </div>
  );
};
