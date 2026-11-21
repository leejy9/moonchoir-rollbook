import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../services/sheetsStorage';
import type { PracticePiece } from '../types/rollbook';
import { getKSTDateString } from '../utils/date';
import {
  buildProgramScopes,
  filterPiecesByScope,
  searchPieces,
} from '../utils/practiceScope';
import { PieceDetail } from './studio/PieceDetail';
import { PieceListItem } from './studio/PieceListItem';
import { ProgramScopeMenu } from './studio/ProgramScopeMenu';
import '../styles/v3/studio.css';

export interface StudioTabProps {
  onOpenAdmin?: () => void;
  onOpenScore?: (piece: PracticePiece) => void;
}

/**
 * 단원 연습실 탭 화면 (MEMBER_UX_V3_SPEC.md §3-1, §3-2).
 * - 공연 드롭다운 (ProgramScopeMenu): 전체 곡 / 다가오는 공연 / 공연 미정 / 지난 공연
 * - 곡 이름, 작곡가, 편곡자, 공연명 실시간 검색 (searchPieces)
 * - 공연별 순서 선택 시 1부터 번호 (라벤더 색), 전체 곡/공연 미정은 created_at 내림차순
 * - 마지막 선택 범위 기기 기억 (PREFERENCE_KEYS.STUDIO_SCOPE)
 * - 단원 읽기 전용 곡 상세 (PieceDetail)
 */
export const StudioTab: React.FC<StudioTabProps> = ({ onOpenScore }) => {
  const [catalog, setCatalog] = useState(() => sheetsService.getPracticeCatalog());
  const programCards = sheetsService.getProgramCards();
  const schedules = sheetsService.getSchedules();
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

  // Build program scopes
  const scopes = useMemo(() => {
    return buildProgramScopes(catalog, programCards, schedules, config, todayStr);
  }, [catalog, programCards, schedules, config, todayStr]);

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

  // Filter and sort pieces by scope
  const scopedPieces = useMemo(() => {
    return filterPiecesByScope(catalog.pieces, catalog.programPieces, effectiveScopeId);
  }, [catalog.pieces, catalog.programPieces, effectiveScopeId]);

  // Search pieces
  const displayedPieces = useMemo(() => {
    return searchPieces(scopedPieces, programCards, catalog.programPieces, searchQuery);
  }, [scopedPieces, programCards, catalog.programPieces, searchQuery]);

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

  // Connected program IDs by pieceId
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
          programCards={programCards}
          connectedProgramIds={connectedProgramIdsByPieceId.get(selectedPiece.id) || []}
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

      {/* 3. Program Scope Dropdown */}
      <ProgramScopeMenu
        scopes={scopes}
        selectedScopeId={effectiveScopeId}
        onSelectScope={handleSelectScope}
      />

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
