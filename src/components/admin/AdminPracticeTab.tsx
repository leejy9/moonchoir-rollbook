import React, { useEffect, useState, useCallback } from 'react';
import { sheetsService } from '../../services/sheets';
import type { AppConfig, PracticeCatalog, PracticePiece, ProgramCard, Schedule } from '../../types/rollbook';
import { uploadQueue, useUploadQueue } from '../../services/media/uploadQueue';
import { PieceListSection } from './practice/PieceListSection';
import { PieceEditModal } from './practice/PieceEditModal';
import { PerformanceSection } from './practice/PerformanceSection';
import { setupUploadCatalogSync } from '../../utils/uploadCatalogSync';
import '../../styles/v3/adminPractice.css';

interface AdminPracticeTabProps {
  config: AppConfig;
  programCards?: ProgramCard[];
  schedules?: Schedule[];
  onDataChanged: () => void;
}

type SubSection = 'PIECES' | 'PERFORMANCES';

export const AdminPracticeTab: React.FC<AdminPracticeTabProps> = ({
  config,
  programCards = [],
  schedules = [],
  onDataChanged,
}) => {
  const [subSection, setSubSection] = useState<SubSection>('PIECES');
  const [catalog, setCatalog] = useState<PracticeCatalog>(() => sheetsService.getPracticeCatalog());
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentScopeId, setCurrentScopeId] = useState<string>('ALL');
  const [editingPiece, setEditingPiece] = useState<Partial<PracticePiece> | null>(null);

  const { activeCount, failedCount } = useUploadQueue();

  const reloadCatalog = useCallback(async () => {
    try {
      const refreshed = await sheetsService.refreshPracticeCatalog();
      setCatalog(refreshed);
      setEditingPiece((prev) => {
        if (!prev?.id) return prev;
        const updated = refreshed.pieces.find((p) => p.id === prev.id);
        return updated ?? prev;
      });
    } catch (err: unknown) {
      console.warn('[AdminPracticeTab] Failed to reload catalog:', err);
    }
  }, []);

  useEffect(() => {
    return setupUploadCatalogSync(uploadQueue, reloadCatalog, 300);
  }, [reloadCatalog]);

  useEffect(() => {
    let cancelled = false;
    sheetsService
      .refreshPracticeCatalog()
      .then((refreshed) => {
        if (!cancelled) setCatalog(refreshed);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn('[AdminPracticeTab] Initial catalog fetch failed:', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePieceSaved = async () => {
    await reloadCatalog();
    onDataChanged();
  };

  return (
    <div className="admin-practice-container">
      {/* 헤더 */}
      <div className="admin-practice-header">
        <div className="admin-practice-title-group">
          <h2 className="admin-practice-title">연습곡</h2>
          {activeCount > 0 && (
            <span className="admin-uploading-chip">
              올리는 중 {activeCount}
            </span>
          )}
          {failedCount > 0 && (
            <span
              className="admin-uploading-chip"
              style={{ background: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
            >
              실패 {failedCount}
            </span>
          )}
        </div>
      </div>

      {/* 하위 탭: 곡 / 공연 (V3-15) */}
      <div className="admin-practice-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subSection === 'PIECES'}
          aria-label="곡 및 트랙 관리"
          className={`admin-practice-tab-btn ${subSection === 'PIECES' ? 'active' : ''}`}
          onClick={() => setSubSection('PIECES')}
        >
          곡
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subSection === 'PERFORMANCES'}
          aria-label="공연"
          className={`admin-practice-tab-btn ${subSection === 'PERFORMANCES' ? 'active' : ''}`}
          onClick={() => setSubSection('PERFORMANCES')}
        >
          공연
        </button>
      </div>

      {/* 탭 본문 */}
      {subSection === 'PIECES' ? (
        <PieceListSection
          catalog={catalog}
          programCards={programCards}
          schedules={schedules}
          config={config}
          currentScopeId={currentScopeId}
          onSelectScope={setCurrentScopeId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
          onSelectPiece={(piece) => setEditingPiece(piece)}
          onAddNewPiece={() => setEditingPiece({ title: '', composer: '', arranger: '' })}
        />
      ) : (
        <PerformanceSection
          catalog={catalog}
          onDataChanged={async () => {
            await reloadCatalog();
            onDataChanged();
          }}
        />
      )}

      {/* 곡 편집 모달 */}
      {editingPiece && (
        <PieceEditModal
          piece={editingPiece}
          catalog={catalog}
          programCards={programCards}
          config={config}
          onClose={() => setEditingPiece(null)}
          onSaved={handlePieceSaved}
        />
      )}
    </div>
  );
};
