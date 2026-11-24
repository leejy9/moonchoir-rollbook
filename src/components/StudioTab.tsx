import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../services/sheetsStorage';
import type { PracticePiece } from '../types/rollbook';
import { getKSTDateString } from '../utils/date';
import {
  buildPerformanceScopes,
  filterPiecesByScope,
  searchPieces,
} from '../utils/practiceScope';
import { PieceDetail } from './studio/PieceDetail';
import { PieceListItem } from './studio/PieceListItem';
import { ProgramScopeMenu } from './studio/ProgramScopeMenu';
import { useAudioPlayer } from './audio/audioPlayerContext';
import { buildPerformanceQueue } from '../utils/practiceQueue';
import '../styles/v3/studio.css';

export interface StudioTabProps {
  onOpenAdmin?: () => void;
  onOpenScore?: (piece: PracticePiece) => void;
  onOpenFullPlayer?: () => void;
}

/**
 * 단원 연습실 탭 화면 (MEMBER_UX_V3_SPEC.md §3-1, §3-2).
 * - 공연 드롭다운 (ProgramScopeMenu): 전체 곡 / 다가오는 공연 / 공연 미정 / 지난 공연
 * - 공연 선택 시 "전체 재생" 버튼 (V25, §3-1, §3-3-1)
 * - 곡 이름, 작곡가, 편곡자, 공연명 실시간 검색 (searchPieces)
 * - 공연별 순서 선택 시 1부터 번호 (라벤더 색), 전체 곡/공연 미정은 created_at 내림차순
 * - 마지막 선택 범위 기기 기억 (PREFERENCE_KEYS.STUDIO_SCOPE)
 * - 단원 읽기 전용 곡 상세 (PieceDetail)
 */
export const StudioTab: React.FC<StudioTabProps> = ({ onOpenScore, onOpenFullPlayer }) => {
  const audioPlayer = useAudioPlayer();
  const [catalog, setCatalog] = useState(() => sheetsService.getPracticeCatalog());
  const programCards = sheetsService.getProgramCards();
  const config = sheetsService.getConfig();
  const backendKind = sheetsService.getBackendKind();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  // Preference for selected program scope
  const [selectedScopeId, setSelectedScopeId] = useState<string>(() => {
    return readPreference<string>(
      PREFERENCE_KEYS.STUDIO_SCOPE,
      (v): v is string => typeof v === 'string',
      'ALL'
    );
  });

  const todayStr = useMemo(() => getKSTDateString(), []);

  // Remote catalog refresh on tab mount (Supabase mode only)
  useEffect(() => {
    if (backendKind === 'gas') return;
    let isCancelled = false;
    sheetsService
      .refreshPracticeCatalog()
      .then(() => {
        if (!isCancelled) {
          setCatalog(sheetsService.getPracticeCatalog());
        }
      })
      .catch((err) => {
        console.warn('[StudioTab] refreshPracticeCatalog failed:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [backendKind]);

  // Build performance scopes (V18)
  const scopes = useMemo(() => {
    return buildPerformanceScopes(catalog, todayStr);
  }, [catalog, todayStr]);

  // Derived effective scope; if selected scope was removed, fall back to 'ALL'
  const effectiveScopeId = useMemo(() => {
    if (selectedScopeId === 'ALL' || selectedScopeId === 'UNASSIGNED') return selectedScopeId;
    const exists = scopes.some((s) => s.id === selectedScopeId);
    return exists ? selectedScopeId : 'ALL';
  }, [scopes, selectedScopeId]);

  const handleSelectScope = useCallback((scopeId: string) => {
    setSelectedScopeId(scopeId);
    writePreference(PREFERENCE_KEYS.STUDIO_SCOPE, scopeId);
  }, []);

  // Performance queue for "전체 재생" (V25, §3-1, §3-3-1)
  const isPerformanceScope = effectiveScopeId !== 'ALL' && effectiveScopeId !== 'UNASSIGNED';

  const perfQueue = useMemo(() => {
    if (!isPerformanceScope) return [];
    return buildPerformanceQueue(effectiveScopeId, catalog, config);
  }, [isPerformanceScope, effectiveScopeId, catalog, config]);

  const canPlayAll = isPerformanceScope && perfQueue.length > 0;

  const handlePlayAll = useCallback(() => {
    if (!isPerformanceScope || perfQueue.length === 0) return;
    const perfTitle =
      scopes.find((s) => s.id === effectiveScopeId)?.title ||
      catalog.performances.find((p) => p.id === effectiveScopeId)?.title ||
      '공연';
    audioPlayer.playQueue(
      { kind: 'performance', id: effectiveScopeId, title: perfTitle },
      perfQueue,
      0,
      'off'
    );
    onOpenFullPlayer?.();
  }, [isPerformanceScope, perfQueue, audioPlayer, effectiveScopeId, scopes, catalog.performances, onOpenFullPlayer]);

  // Filter and sort pieces by scope
  const scopedPieces = useMemo(() => {
    return filterPiecesByScope(catalog.pieces, catalog.performancePieces, effectiveScopeId);
  }, [catalog.pieces, catalog.performancePieces, effectiveScopeId]);

  // Search pieces
  const displayedPieces = useMemo(() => {
    return searchPieces(scopedPieces, catalog.performances, catalog.performancePieces, searchQuery);
  }, [scopedPieces, catalog.performances, catalog.performancePieces, searchQuery]);

  // Map pieceId -> tracks
  const tracksByPieceId = useMemo(() => {
    const map = new Map<string, typeof catalog.tracks>();
    for (const t of catalog.tracks) {
      if (t.isArchived) continue;
      const existing = map.get(t.pieceId);
      if (existing) {
        existing.push(t);
      } else {
        map.set(t.pieceId, [t]);
      }
    }
    return map;
  }, [catalog.tracks]);

  // Connected performance IDs by pieceId
  const connectedPerformanceIdsByPieceId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pp of catalog.performancePieces) {
      if (pp.isArchived) continue;
      const existing = map.get(pp.pieceId);
      if (existing) {
        existing.push(pp.performanceId);
      } else {
        map.set(pp.pieceId, [pp.performanceId]);
      }
    }
    return map;
  }, [catalog.performancePieces]);

  // Connected program IDs by pieceId (legacy fallback)
  const connectedProgramIdsByPieceId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pp of catalog.programPieces) {
      if (pp.isArchived) continue;
      const existing = map.get(pp.pieceId);
      if (existing) {
        existing.push(pp.programId);
      } else {
        map.set(pp.pieceId, [pp.programId]);
      }
    }
    return map;
  }, [catalog.programPieces]);

  // Selected piece for detail view
  const selectedPiece = useMemo(() => {
    if (!selectedPieceId) return null;
    return catalog.pieces.find((p) => p.id === selectedPieceId) || null;
  }, [catalog.pieces, selectedPieceId]);

  if (backendKind === 'gas') {
    return (
      <div className="tab-container studio-tab" style={{ padding: '24px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-main)' }}>
          연습실
        </h2>
        <div
          style={{
            padding: '24px 16px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          연습실 기능은 준비 중입니다.
          <br />
          음원 스트리밍 서비스 연동 후 제공될 예정입니다.
        </div>
      </div>
    );
  }

  // Piece Detail View
  if (selectedPiece) {
    return (
      <div className="tab-container studio-tab studio-container">
        <PieceDetail
          piece={selectedPiece}
          tracks={tracksByPieceId.get(selectedPiece.id) || []}
          catalog={catalog}
          programCards={programCards}
          connectedProgramIds={connectedProgramIdsByPieceId.get(selectedPiece.id) || []}
          performances={catalog.performances}
          connectedPerformanceIds={connectedPerformanceIdsByPieceId.get(selectedPiece.id) || []}
          config={config}
          mediaPublicBaseUrl={config.mediaPublicBaseUrl}
          onBack={() => setSelectedPieceId(null)}
          onOpenScore={onOpenScore}
        />
      </div>
    );
  }

  // Piece List View
  return (
    <div className="tab-container studio-tab studio-container">
      {/* 1. Header */}
      <header className="studio-header">
        <h2 className="studio-title">연습실</h2>
        <a
          href="https://drive.google.com/drive/u/0/folders/1GNl2Cz9JjzOavmtBiFZXcbuvxFlmdY_U"
          target="_blank"
          rel="noopener noreferrer"
          className="studio-drive-link"
          aria-label="악보 모음 구글 드라이브 열기 (새 창)"
        >
          <svg className="studio-drive-icon" width="16" height="14" viewBox="0 0 87.3 78" fill="none" aria-hidden="true">
            <path d="M6.6 66.85L10.45 73.5C11.25 74.9 12.4 76 13.75 76.8L27.5 53H0C0 54.55 0.4 56.1 1.2 57.5L6.6 66.85Z" fill="#0066DA" />
            <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5C0.4 49.9 0 51.45 0 53H27.5L43.65 25Z" fill="#00AC47" />
            <path d="M73.55 76.8C74.9 76 76.05 74.9 76.85 73.5L86.1 57.5C86.9 56.1 87.3 54.55 87.3 53H59.8L73.55 76.8Z" fill="#EA4335" />
            <path d="M43.65 25L57.4 1.2C56.05 0.4 54.5 0 52.9 0H34.4C32.8 0 31.25 0.4 29.9 1.2L43.65 25Z" fill="#00832D" />
            <path d="M59.8 53H27.5L13.75 76.8C15.1 77.6 16.65 78 18.25 78H69.05C70.65 78 72.2 77.6 73.55 76.8L59.8 53Z" fill="#2684FC" />
            <path d="M73.4 26.5L60.7 4.5C59.9 3.1 58.75 2 57.4 1.2L43.65 25L59.8 53H87.3C87.3 51.45 86.9 49.9 86.1 48.5L73.4 26.5Z" fill="#FFBA00" />
          </svg>
          <span>악보 모음</span>
          <svg className="studio-drive-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </a>
      </header>

      {/* 2. Search Bar */}
      <div className="studio-search-wrap">
        <span className="studio-search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          className="studio-search-input"
          placeholder="곡 이름·작곡가 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="곡 검색"
        />
        {searchQuery && (
          <button
            type="button"
            className="studio-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="검색어 지우기"
          >
            ×
          </button>
        )}
      </div>

      {/* 3. Program Scope Dropdown & Play All (V25, §3-1) */}
      <div className="studio-scope-row">
        <ProgramScopeMenu
          scopes={scopes}
          selectedScopeId={effectiveScopeId}
          onSelectScope={handleSelectScope}
        />
        {canPlayAll && (
          <button
            type="button"
            className="studio-play-all-btn"
            onClick={handlePlayAll}
            aria-label="전체 재생"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>전체 재생</span>
          </button>
        )}
      </div>

      {/* 4. Empty State */}
      {displayedPieces.length === 0 && (
        <div
          style={{
            padding: '32px 16px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '14px',
          }}
        >
          {searchQuery ? '검색 결과가 없습니다.' : '등록된 연습곡이 없습니다.'}
        </div>
      )}

      {/* 5. Piece List */}
      <div className="studio-piece-list">
        {displayedPieces.map(({ piece, orderNumber }) => (
          <PieceListItem
            key={piece.id}
            piece={piece}
            tracks={tracksByPieceId.get(piece.id) || []}
            orderNumber={orderNumber}
            todayStr={todayStr}
            onClick={() => setSelectedPieceId(piece.id)}
          />
        ))}
      </div>
    </div>
  );
};
