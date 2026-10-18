import React from 'react';
import { sheetsService } from '../../services/sheets';
import type { CardGroupToDelete } from '../../hooks/useScheduleAdmin';

export interface CardGroupDeleteModalProps {
  cardGroupToDelete: CardGroupToDelete | null;
  onClose: () => void;
  onDataChanged: () => void;
  onSetSuccessMsg: (msg: string) => void;
}

export const CardGroupDeleteModal: React.FC<CardGroupDeleteModalProps> = ({
  cardGroupToDelete,
  onClose,
  onDataChanged,
  onSetSuccessMsg,
}) => {
  if (!cardGroupToDelete) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        style={{ maxWidth: '460px', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '14px' }}>
          <div
            className="modal-badge"
            style={{ color: '#DC2626', borderColor: '#FECDD3', background: '#FEF2F2' }}
          >
            📦 일정 카드 삭제 확인
          </div>
          <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '10px', color: '#1E293B' }}>
            '[{cardGroupToDelete.title}]' 일정을 카드에서 삭제할까요?
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
              🏷️ <strong>구분:</strong> {cardGroupToDelete.category}
            </div>
            <div>
              📋 <strong>소속 회차:</strong> 총 {cardGroupToDelete.schedules.length}회차 등록됨
            </div>
            <div>
              📍 <strong>카드 상태:</strong>{' '}
              {cardGroupToDelete.isRegisteredCard ? '시트 저장된 정식 카드' : '일정 기반 자동 묶음 카드'}
            </div>
          </div>
        </div>

        {cardGroupToDelete.schedules.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '12.5px', color: '#4E5968', lineHeight: '1.5' }}>
              일정이 이 카드에 소속되어 있습니다. 카드를 삭제할 때 소속된 일정(
              {cardGroupToDelete.schedules.length}개)도 함께 처리할 방법을 선택하세요:
            </p>

            {/* Option 1: Delete Card + Contained Schedules (Recommended) */}
            <button
              type="button"
              style={{
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1.5px solid #FCA5A5',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                boxShadow: '0 1px 3px rgba(220, 38, 38, 0.1)',
              }}
              onClick={async () => {
                const target = cardGroupToDelete;
                onClose();
                try {
                  if (target.isRegisteredCard) {
                    await sheetsService.deleteProgramCard(target.cardId);
                  }
                  if (target.schedules.length > 0) {
                    await sheetsService.deleteSchedules(target.schedules.map((s) => s.id));
                  }
                  onSetSuccessMsg(
                    `[${target.title}] 카드와 소속된 ${target.schedules.length}개 일정이 모두 영구 삭제되었습니다.`
                  );
                  onDataChanged();
                } catch (err: unknown) {
                  alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              <span style={{ fontSize: '13.5px' }}>
                🔥 카드 및 소속 일정({cardGroupToDelete.schedules.length}개) 모두 일괄 삭제 (권장)
              </span>
              <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 400 }}>
                구글 시트의 [일정카드] 및 [일정] 탭에서 모두 삭제되어 카드가 완전히 제거됩니다.
              </span>
            </button>

            {/* Option 2: Delete Card Only, Keep Schedules as Unbundled */}
            {cardGroupToDelete.isRegisteredCard && (
              <button
                type="button"
                style={{
                  background: '#F8FAFC',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
                onClick={async () => {
                  const target = cardGroupToDelete;
                  onClose();
                  try {
                    await sheetsService.deleteProgramCard(target.cardId);
                    if (target.schedules.length > 0) {
                      await sheetsService.batchUpdateSchedules(
                        target.schedules.map((s) => s.id),
                        { programId: undefined }
                      );
                    }
                    onSetSuccessMsg(
                      `[${target.title}] 카드 묶음만 삭제되었습니다. 소속 일정은 독립 일정으로 보존됩니다.`
                    );
                    onDataChanged();
                  } catch (err: unknown) {
                    alert(err instanceof Error ? err.message : '카드 삭제 중 오류가 발생했습니다.');
                  }
                }}
              >
                <span>📦 카드만 삭제 (일정 {cardGroupToDelete.schedules.length}개는 미분류로 보존)</span>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                  카드 등록 정보만 지우고, 개별 일정 데이터와 출결 기록은 유지합니다.
                </span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary-cancel"
              style={{ minHeight: '40px', marginTop: '6px' }}
              onClick={onClose}
            >
              취소
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B' }}>
              이 카드에 소속된 일정이 없습니다. 카드를 영구 삭제하시겠습니까?
            </p>
            <button
              type="button"
              className="btn-primary-large"
              style={{ backgroundColor: '#DC2626', minHeight: '44px', fontWeight: 700 }}
              onClick={async () => {
                const target = cardGroupToDelete;
                onClose();
                try {
                  if (target.isRegisteredCard) {
                    await sheetsService.deleteProgramCard(target.cardId);
                  }
                  onSetSuccessMsg(`[${target.title}] 카드가 삭제되었습니다.`);
                  onDataChanged();
                } catch (err: unknown) {
                  alert(err instanceof Error ? err.message : '카드 삭제 중 오류가 발생했습니다.');
                }
              }}
            >
              🗑️ 빈 카드 삭제하기
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
        )}
      </div>
    </div>
  );
};
