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
    <div className="admin-program-cards-view-root" style={{ width: '100%' }}>
      {/* Program Group Cards */}
      {programGroups.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
          }}
        >
          {programGroups.map((group) => {
            const isExpanded = expandedCardIds.has(group.cardId);
            const audienceLabel =
              group.targetAudienceType === 'PARTS'
                ? group.targetParts?.join(', ') || '파트 미지정'
                : group.targetAudienceType === 'CUSTOM_MEMBERS'
                ? `선발 ${group.targetMemberIds?.length || 0}명`
                : group.targetAudienceType === 'ALL_WITH_GUESTS'
                ? '전체 + 객원'
                : '전체';

            return (
              <div
                key={group.cardId}
                data-testid={`program-group-${group.cardId}`}
                style={{
                  background: '#FFFFFF',
                  border: group.isRegisteredCard ? '1.5px solid #C7D2FE' : '1px solid #E2E8F0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {/* Clean 1-line Card Header (Tap to Expand) */}
                <div
                  onClick={() => toggleExpand(group.cardId)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    gap: '10px',
                    cursor: 'pointer',
                    minHeight: '46px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <span className="schedule-category-badge" style={{ flexShrink: 0 }}>
                      {group.category}
                    </span>
                    <strong
                      style={{
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#1E293B',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {group.title}
                    </strong>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#6366F1',
                        background: '#EEF2FF',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {group.schedules.length}회
                    </span>
                  </div>

                  <span style={{ fontSize: '11px', color: '#94A3B8', flexShrink: 0 }}>
                    {isExpanded ? '▴' : '▾'}
                  </span>
                </div>

                {/* Expanded Card Details & Schedule Rows */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '10px 14px 14px',
                      borderTop: '1px solid #F1F5F9',
                      background: '#F8FAFC',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>
                        {group.startDate ? `${group.startDate} ~ ${group.endDate}` : '일정 없음'} ·{' '}
                        {group.startTime}~{group.endTime} · {group.locationName} · 대상: {audienceLabel}
                      </div>
                      {group.description && <div style={{ color: '#64748B' }}>{group.description}</div>}
                    </div>

                    {/* Card Action Buttons */}
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
                            targetAudienceType: group.targetAudienceType || 'PARTS',
                            targetParts: group.targetParts,
                            targetMemberIds: group.targetMemberIds,
                            isArchived: group.isArchived,
                            createdAt: getKSTTimestampString(),
                          };
                          onOpenEditCard(group.rawCard || fallbackCard);
                        }}
                        style={{
                          background: '#FFFFFF',
                          color: '#334155',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        수정
                      </button>

                      <button
                        type="button"
                        onClick={() => onAddRehearsal(group)}
                        style={{
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          border: '1px solid #C7D2FE',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        + 일정 추가
                      </button>

                      <button
                        type="button"
                        onClick={() => onDuplicateSeries(group.cardId)}
                        style={{
                          background: '#F0FDF4',
                          color: '#059669',
                          border: '1px solid #BBF7D0',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        복제
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
                          background: group.isArchived ? '#EDE9FE' : '#FFFFFF',
                          color: group.isArchived ? '#6D28D9' : '#475569',
                          border: `1px solid ${group.isArchived ? '#C4B5FD' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {group.isArchived ? '복원' : '보관'}
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
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        삭제
                      </button>
                    </div>

                    {/* Child Schedules inside the Card */}
                    {group.schedules.length > 0 && (
                      <div
                        style={{
                          borderTop: '1px solid #E2E8F0',
                          paddingTop: '8px',
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
                                padding: '8px 10px',
                                background: isSelectedForEdit ? '#EEF2FF' : '#FFFFFF',
                                border: isSelectedForEdit
                                  ? '1.5px solid #6366F1'
                                  : '1px solid #E2E8F0',
                                borderRadius: '8px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                gap: '8px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                <strong style={{ color: '#2563EB', whiteSpace: 'nowrap' }}>{sch.date}</strong>
                                <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{sch.startTime}</span>
                                <span
                                  style={{
                                    color: '#1E293B',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {sch.title}
                                </span>
                              </div>

                              <div
                                style={{ display: 'flex', gap: '4px', flexShrink: 0 }}
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
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  수정
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
                                    whiteSpace: 'nowrap',
                                  }}
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
                                    whiteSpace: 'nowrap',
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
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <p className="empty-subtext" style={{ margin: '0 0 10px' }}>
            등록된 일정 카드가 없습니다.
          </p>
          <button
            type="button"
            onClick={onOpenCreateCard}
            style={{
              background: 'var(--brand-primary)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            + 카드 등록
          </button>
        </div>
      )}
    </div>
  );
};
