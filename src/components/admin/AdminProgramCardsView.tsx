import React, { useState } from 'react';
import type {
  LocationPreset,
  PartType,
  ProgramCard,
  Schedule,
  ScheduleCategory,
  TargetAudienceType,
} from '../../types/rollbook';
import { getKSTTimestampString } from '../../utils/date';

export interface ProgramGroupItem {
  cardId: string;
  title: string;
  category: ScheduleCategory;
  description?: string;
  locationName: string;
  startTime: string;
  endTime: string;
  targetAudienceType?: TargetAudienceType;
  targetParts?: PartType[];
  targetMemberIds?: string[];
  schedules: Schedule[];
  startDate: string;
  endDate: string;
  isArchived: boolean;
  isRegisteredCard: boolean;
  rawCard?: ProgramCard;
}

export interface AdminProgramCardsViewProps {
  programGroups: ProgramGroupItem[];
  locationPresets: LocationPreset[];
  editingScheduleId?: string | null;
  onOpenCreateCard: () => void;
  onOpenEditCard: (card: ProgramCard) => void;
  onRequestDeleteCard: (cardGroup: {
    cardId: string;
    title: string;
    category: ScheduleCategory;
    schedules: Schedule[];
    isRegisteredCard: boolean;
    rawCard?: ProgramCard;
  }) => void;
  onAddRehearsal: (group: ProgramGroupItem) => void;
  onDuplicateSeries: (cardId: string) => void;
  onToggleArchiveGroup: (scheduleIds: string[], archive: boolean) => void;
  onSelectScheduleForEdit: (schedule: Schedule) => void;
  onCloneSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (id: string, title: string) => void;
}

export const AdminProgramCardsView: React.FC<AdminProgramCardsViewProps> = ({
  programGroups,
  locationPresets,
  editingScheduleId,
  onOpenCreateCard,
  onOpenEditCard,
  onRequestDeleteCard,
  onAddRehearsal,
  onDuplicateSeries,
  onToggleArchiveGroup,
  onSelectScheduleForEdit,
  onCloneSchedule,
  onDeleteSchedule,
}) => {
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

  const toggleExpand = (cardId: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  return (
    <div className="admin-program-cards-view-root">
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            📦 일정 카드(프로젝트) 묶음 관리
          </h2>
          <p className="section-subtitle" style={{ margin: '4px 0 0' }}>
            구글 시트 [일정카드] 탭과 실시간 동기화되어 학기별 정기연습과 추가연습을 영구 보존 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCreateCard}
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 5px rgba(79, 70, 229, 0.25)',
          }}
        >
          ➕ 새 일정 카드 만들기
        </button>
      </div>

      {/* Program Group Cards */}
      {programGroups.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '520px',
            overflowY: 'auto',
          }}
        >
          {programGroups.map((group) => {
            const isExpanded = expandedCardIds.has(group.cardId);
            const audienceLabel =
              group.targetAudienceType === 'PARTS'
                ? `👥 파트: ${group.targetParts?.join(', ') || '지정 없음'}`
                : group.targetAudienceType === 'CUSTOM_MEMBERS'
                ? `🎯 선발단원: ${group.targetMemberIds?.length || 0}명`
                : group.targetAudienceType === 'ALL_WITH_GUESTS'
                ? '🎼 전체 + 객원'
                : '🌐 전체 (선생님 포함)';

            return (
              <div
                key={group.cardId}
                data-testid={`program-group-${group.cardId}`}
                style={{
                  background: '#FFFFFF',
                  border: group.isRegisteredCard ? '1.5px solid #C7D2FE' : '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className="schedule-category-badge">{group.category}</span>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>
                        {group.title}
                      </h3>
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#6366F1',
                          background: '#EEF2FF',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                        }}
                      >
                        총 {group.schedules.length}회차
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#047857',
                          background: '#D1FAE5',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {audienceLabel}
                      </span>
                      {group.isRegisteredCard && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            color: '#4338CA',
                            background: '#E0E7FF',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          시트 저장됨
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                      {group.startDate
                        ? `📅 ${group.startDate} ~ ${group.endDate}`
                        : '📅 등록된 회차 일정 없음'}{' '}
                      · 🕒 {group.startTime}~{group.endTime} · 📍 {group.locationName}
                    </p>
                    {group.description && (
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94A3B8' }}>
                        메모: {group.description}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const fallbackCard: ProgramCard = {
                          id: group.cardId.startsWith('card_')
                            ? group.cardId
                            : `card_${Date.now()}`,
                          title: group.title,
                          category: group.category,
                          description: group.description,
                          defaultLocationId: locationPresets.find(
                            (l) => l.name === group.locationName
                          )?.id,
                          defaultStartTime: group.startTime,
                          defaultEndTime: group.endTime,
                          targetAudienceType: group.targetAudienceType || 'ALL',
                          targetParts: group.targetParts,
                          targetMemberIds: group.targetMemberIds,
                          isArchived: group.isArchived,
                          createdAt: getKSTTimestampString(),
                        };
                        onOpenEditCard(group.rawCard || fallbackCard);
                      }}
                      style={{
                        background: '#F8FAFC',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="일정 카드 속성 수정"
                    >
                      ✏️ 카드 수정
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onRequestDeleteCard({
                          cardId: group.cardId,
                          title: group.title,
                          category: group.category,
                          schedules: group.schedules,
                          isRegisteredCard: group.isRegisteredCard,
                          rawCard: group.rawCard,
                        });
                      }}
                      style={{
                        background: '#FFF1F2',
                        color: '#E11D48',
                        border: '1px solid #FECDD3',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="일정 카드 삭제"
                    >
                      🗑️ 카드 삭제
                    </button>

                    <button
                      type="button"
                      onClick={() => onAddRehearsal(group)}
                      style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        border: '1px solid #C7D2FE',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ➕ 추가연습 등록
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateSeries(group.cardId)}
                      style={{
                        background: '#F0FDF4',
                        color: '#059669',
                        border: '1px solid #BBF7D0',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="일정 카드 및 소속 일정 복제"
                    >
                      🔁 복제
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onToggleArchiveGroup(
                          group.schedules.map((s) => s.id),
                          !group.isArchived
                        )
                      }
                      style={{
                        background: group.isArchived ? '#EDE9FE' : '#F8FAFC',
                        color: group.isArchived ? '#6D28D9' : '#475569',
                        border: `1px solid ${group.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {group.isArchived ? '📂 보관 해제' : '📦 아카이브'}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(group.cardId)}
                      style={{
                        background: isExpanded ? '#F1F5F9' : '#FFFFFF',
                        color: '#475569',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isExpanded ? '▲ 접기' : `▼ 일정표 (${group.schedules.length})`}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      marginTop: '12px',
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {group.schedules.map((sch) => {
                      const isSelectedForEdit = editingScheduleId === sch.id;
                      return (
                        <div
                          key={sch.id}
                          data-testid={`card-sch-item-${sch.id}`}
                          onClick={() => onSelectScheduleForEdit(sch)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: isSelectedForEdit ? '#EEF2FF' : '#F8FAFC',
                            border: isSelectedForEdit
                              ? '1.5px solid #6366F1'
                              : '1px solid #E2E8F0',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: isSelectedForEdit
                              ? '0 0 0 2px rgba(99, 102, 241, 0.2)'
                              : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          title="클릭하여 우측에서 일정 정보 수정"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isSelectedForEdit && (
                              <span
                                style={{ fontSize: '11px', color: '#4F46E5', fontWeight: 700 }}
                              >
                                ✏️ 편집 중:
                              </span>
                            )}
                            <strong style={{ color: '#2563EB' }}>{sch.date}</strong>
                            <span style={{ color: '#1E293B', fontWeight: 600 }}>{sch.title}</span>
                            <span style={{ color: '#64748B' }}>
                              ({sch.startTime}~{sch.endTime})
                            </span>
                          </div>

                          <div
                            style={{ display: 'flex', gap: '4px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectScheduleForEdit(sch);
                              }}
                              style={{
                                background: '#EEF2FF',
                                color: '#4F46E5',
                                border: '1px solid #C7D2FE',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              title="우측 폼에서 일정 및 대상자 정보 수정"
                            >
                              ✏️ 수정
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCloneSchedule(sch);
                              }}
                              style={{
                                background: '#F1F5F9',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              title="일정 복제"
                            >
                              복제
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSchedule(sch.id, sch.title);
                              }}
                              style={{
                                background: '#FEE2E2',
                                color: '#DC2626',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-subtext" style={{ padding: '24px 0', textAlign: 'center', margin: 0 }}>
          등록된 일정 카드가 없습니다.
        </p>
      )}
    </div>
  );
};
