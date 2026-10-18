import React from 'react';
import type { ProgramCard, Schedule } from '../../types/rollbook';

export interface ScheduleDeleteModalProps {
  scheduleToDelete: Schedule | null;
  schedules: Schedule[];
  programCards: ProgramCard[];
  forceHardDeleteSelected: boolean;
  setForceHardDeleteSelected: (force: boolean) => void;
  onClose: () => void;
  onDeleteSingle: (id: string, title: string, forceHardDelete?: boolean) => Promise<void>;
  onDeleteSeries: (matchingIds: string[], title: string, forceHardDelete?: boolean) => Promise<void>;
}

export const ScheduleDeleteModal: React.FC<ScheduleDeleteModalProps> = ({
  scheduleToDelete,
  schedules,
  programCards,
  forceHardDeleteSelected,
  setForceHardDeleteSelected,
  onClose,
  onDeleteSingle,
  onDeleteSeries,
}) => {
  if (!scheduleToDelete) return null;

  const companions = schedules.filter((s) => {
    if (s.id === scheduleToDelete.id) return false;
    // 1. 소속 일정 카드(programId) 일치 최우선
    if (scheduleToDelete.programId && s.programId) {
      return s.programId === scheduleToDelete.programId;
    }
    // 2. 반복 시리즈(seriesId) 일치
    if (scheduleToDelete.seriesId && s.seriesId) {
      return s.seriesId === scheduleToDelete.seriesId;
    }
    // 3. 동일 제목
    return s.title === scheduleToDelete.title;
  });

  const futureCompanions = companions.filter((c) => c.date >= scheduleToDelete.date);
  const isRepeating = companions.length > 0;
  const attachedCard = scheduleToDelete.programId
    ? programCards.find((c) => c.id === scheduleToDelete.programId)
    : null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        style={{ maxWidth: '440px', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '14px' }}>
          <div
            className="modal-badge"
            style={{ color: '#DC2626', borderColor: '#FECDD3', background: '#FEF2F2' }}
          >
            🗑️ 일정 삭제 확인
          </div>
          <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '10px', color: '#1E293B' }}>
            '{scheduleToDelete.title}' 일정을 삭제할까요?
          </h2>
          <div
            style={{
              marginTop: '10px',
              padding: '12px',
              background: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              fontSize: '12.5px',
              color: '#475569',
              lineHeight: '1.6',
            }}
          >
            <div>
              📅 <strong>날짜:</strong> {scheduleToDelete.date}
            </div>
            <div>
              🕒 <strong>시간:</strong> {scheduleToDelete.startTime} ~ {scheduleToDelete.endTime}
            </div>
            <div>
              📍 <strong>장소:</strong> {scheduleToDelete.locationName}
            </div>
            {attachedCard && (
              <div style={{ color: '#0284C7', fontWeight: 600 }}>
                📦 <strong>소속 카드:</strong> {attachedCard.title}
              </div>
            )}
            {isRepeating && (
              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '6px',
                  borderTop: '1px dashed #CBD5E1',
                  color: '#4F46E5',
                  fontWeight: 600,
                }}
              >
                ※ 동일 카드/명칭의 회차가 총 {companions.length + 1}회차 존재합니다.
              </div>
            )}
          </div>
        </div>

        {/* 영구 삭제 옵션 체크박스 */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: forceHardDeleteSelected ? '#DC2626' : '#64748B',
            background: forceHardDeleteSelected ? '#FEF2F2' : '#F8FAFC',
            border: `1px solid ${forceHardDeleteSelected ? '#FECACA' : '#E2E8F0'}`,
            borderRadius: '6px',
            padding: '8px 10px',
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          <input
            type="checkbox"
            checked={forceHardDeleteSelected}
            onChange={(e) => setForceHardDeleteSelected(e.target.checked)}
          />
          <span style={{ fontWeight: forceHardDeleteSelected ? 700 : 500 }}>💥 영구 삭제</span>
        </label>

        {!isRepeating ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B' }}>
              {forceHardDeleteSelected
                ? '일정을 완전히 영구 삭제합니다.'
                : '출결이나 투표 기록이 있으면 기록 보존을 위해 [취소] 처리되며, 없으면 영구 삭제됩니다.'}
            </p>
            <button
              type="button"
              className="btn-primary-large"
              style={{
                backgroundColor: forceHardDeleteSelected ? '#B91C1C' : '#DC2626',
                minHeight: '44px',
                fontWeight: 700,
              }}
              onClick={async () => {
                const id = scheduleToDelete.id;
                const title = scheduleToDelete.title;
                const force = forceHardDeleteSelected;
                onClose();
                await onDeleteSingle(id, title, force);
              }}
            >
              {forceHardDeleteSelected ? '💥 영구 삭제' : '🗑️ 일정 삭제'}
            </button>
            <button
              type="button"
              className="btn-secondary-cancel"
              style={{ minHeight: '42px' }}
              onClick={onClose}
            >
              취소
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              삭제할 범위를 선택하세요:
            </span>
            <button
              type="button"
              style={{
                background: '#FFF1F2',
                color: '#E11D48',
                border: '1px solid #FECDD3',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={async () => {
                const id = scheduleToDelete.id;
                const title = scheduleToDelete.title;
                const force = forceHardDeleteSelected;
                onClose();
                await onDeleteSingle(id, title, force);
              }}
            >
              <span>1️⃣ 이 회차만 삭제 ({scheduleToDelete.date})</span>
              <span style={{ fontSize: '11px', color: '#9F1239', fontWeight: 400, marginTop: '2px' }}>
                {forceHardDeleteSelected ? '이 회차만 영구 삭제합니다.' : '다른 회차 일정은 그대로 유지됩니다.'}
              </span>
            </button>

            {futureCompanions.length > 0 && (
              <button
                type="button"
                style={{
                  background: '#FFF7ED',
                  color: '#EA580C',
                  border: '1px solid #FFEDD5',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onClick={async () => {
                  const targetIds = [scheduleToDelete.id, ...futureCompanions.map((c) => c.id)];
                  const title = scheduleToDelete.title;
                  const force = forceHardDeleteSelected;
                  onClose();
                  await onDeleteSeries(targetIds, title, force);
                }}
              >
                <span>⏩ 오늘 포함 이후 회차 일괄 삭제 ({futureCompanions.length + 1}개)</span>
                <span style={{ fontSize: '11px', color: '#9A3412', fontWeight: 400, marginTop: '2px' }}>
                  {forceHardDeleteSelected
                    ? '이후 회차를 영구 삭제합니다.'
                    : '과거 회차는 보존하고 남은 연습 일정만 삭제합니다.'}
                </span>
              </button>
            )}

            <button
              type="button"
              style={{
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1.5px solid #FCA5A5',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={async () => {
                const allIds = [scheduleToDelete.id, ...companions.map((c) => c.id)];
                const title = scheduleToDelete.title;
                const force = forceHardDeleteSelected;
                onClose();
                await onDeleteSeries(allIds, title, force);
              }}
            >
              <span>💥 전체 {companions.length + 1}개 회차 모두 삭제</span>
              <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 400, marginTop: '2px' }}>
                {forceHardDeleteSelected
                  ? '연결된 모든 회차를 영구 삭제합니다.'
                  : '시리즈에 속한 모든 회차 일정을 삭제합니다.'}
              </span>
            </button>

            <button
              type="button"
              className="btn-secondary-cancel"
              style={{ minHeight: '40px', marginTop: '4px' }}
              onClick={onClose}
            >
              취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
