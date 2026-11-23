import React, { useMemo, useState } from 'react';
import type { Member, Schedule, RSVPVote, RSVPStatus } from '../../types/rollbook';
import { sheetsService } from '../../services/sheets';
import { normalizeToKSTTimestamp } from '../../utils/date';
import {
  isMemberRequiredForSchedule,
  resolveMergedMemberIds,
} from '../../utils/attendanceStats';

export interface ScheduleRsvpLogModalProps {
  schedule: Schedule;
  members: Member[];
  onClose: () => void;
}

type FilterTab = 'ALL' | RSVPStatus | 'UNVOTED';

interface MemberVoteRow {
  memberId: string;
  memberName: string;
  part: string;
  memberStatus: string;
  voteStatus: RSVPStatus | 'UNVOTED';
  reason: string;
  timestamp: string;
  isTarget: boolean;
}

export const ScheduleRsvpLogModal: React.FC<ScheduleRsvpLogModalProps> = ({
  schedule,
  members,
  onClose,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. 해당 일정의 실시간 투표 데이터 조회
  const votes = useMemo(() => {
    return sheetsService.getRSVPVotes(schedule.id);
  }, [schedule.id]);

  // 2. 투표 맵 구성 (memberId -> RSVPVote)
  const votesByMemberId = useMemo(() => {
    const map = new Map<string, RSVPVote>();
    votes.forEach((v) => map.set(v.memberId, v));
    return map;
  }, [votes]);
  const allMembersForIdentity = useMemo(() => {
    const combined = [...sheetsService.getMembers(true, true), ...members];
    return [...new Map(combined.map((member) => [member.id, member])).values()];
  }, [members]);

  // 3. 대상 단원 여부 판정 및 전체 단원 투표 상태 매핑
  const allRows: MemberVoteRow[] = useMemo(() => {
    const activeMembers = members.filter((m) => m.status === 'ACTIVE');

    return activeMembers.map((m) => {
      const vote = votesByMemberId.get(m.id);
      const isTarget = isMemberRequiredForSchedule(
        m,
        schedule.date,
        schedule,
        resolveMergedMemberIds(m.id, allMembersForIdentity),
        allMembersForIdentity
      );
      const voteStatus: RSVPStatus | 'UNVOTED' = vote ? vote.status : 'UNVOTED';
      const reason = vote?.reason || '';
      const timestamp = vote?.timestamp ? normalizeToKSTTimestamp(vote.timestamp) : '';

      return {
        memberId: m.id,
        memberName: m.name,
        part: m.part,
        memberStatus: m.memberStatus || '정단원',
        voteStatus,
        reason,
        timestamp,
        isTarget,
      };
    });
  }, [members, votesByMemberId, schedule, allMembersForIdentity]);

  // 4. 통계 카운트 계산
  const tally = useMemo(() => {
    let attend = 0;
    let absent = 0;
    let unvoted = 0;

    allRows.forEach((r) => {
      // 대상 단원이거나 투표를 남긴 단원 포함
      if (r.voteStatus === 'ATTEND') attend++;
      else if (r.voteStatus === 'ABSENT') absent++;
      else if (r.isTarget) unvoted++;
    });

    return { attend, absent, unvoted, total: attend + absent + unvoted };
  }, [allRows]);

  // 5. 필터 및 검색 적용
  const filteredRows = useMemo(() => {
    return allRows
      .filter((r) => {
        // 탭 필터
        if (activeFilter !== 'ALL' && r.voteStatus !== activeFilter) return false;

        // 검색어 필터 (이름, 파트, 사유)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = r.memberName.toLowerCase().includes(q);
          const matchPart = r.part.toLowerCase().includes(q);
          const matchReason = r.reason.toLowerCase().includes(q);
          if (!matchName && !matchPart && !matchReason) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // 투표 시간순 최신 우선 정렬 (타임스탬프 있는 것 우선)
        if (a.timestamp && b.timestamp) {
          return b.timestamp.localeCompare(a.timestamp);
        }
        if (a.timestamp && !b.timestamp) return -1;
        if (!a.timestamp && b.timestamp) return 1;
        // 미투표자 간에는 파트, 이름 순
        if (a.part !== b.part) return a.part.localeCompare(b.part);
        return a.memberName.localeCompare(b.memberName);
      });
  }, [allRows, activeFilter, searchQuery]);

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-card" style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="modal-badge" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
              사전투표 로그
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#64748B',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '6px' }}>
            {schedule.title}
          </h2>
          <p className="modal-desc" style={{ fontSize: '12.5px', margin: 0 }}>
            {schedule.date} ({schedule.startTime}~{schedule.endTime}) · {schedule.locationName}
            {schedule.visibility === 'TARGETS_ONLY' && (
              <span style={{ marginLeft: '6px', color: '#6366F1', fontWeight: 600 }}>
                [대상자 전용]
              </span>
            )}
          </p>
        </div>

        {/* Tally Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '12px 0 8px' }}>
          <div style={{ background: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>참석</div>
            <div style={{ fontSize: '17px', color: '#15803D', fontWeight: 800 }}>{tally.attend}</div>
          </div>
          <div style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#9A3412', fontWeight: 600 }}>불참</div>
            <div style={{ fontSize: '17px', color: '#C2410C', fontWeight: 800 }}>{tally.absent}</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>미투표</div>
            <div style={{ fontSize: '17px', color: '#475569', fontWeight: 800 }}>{tally.unvoted}</div>
          </div>
        </div>

        {/* Filter Tabs & Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeFilter === 'ALL' ? 700 : 500,
                background: activeFilter === 'ALL' ? '#4F46E5' : '#F1F5F9',
                color: activeFilter === 'ALL' ? '#FFFFFF' : '#475569',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              전체 ({allRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ATTEND')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeFilter === 'ATTEND' ? 700 : 500,
                background: activeFilter === 'ATTEND' ? '#16A34A' : '#F1F5F9',
                color: activeFilter === 'ATTEND' ? '#FFFFFF' : '#475569',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              참석 ({tally.attend})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ABSENT')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeFilter === 'ABSENT' ? 700 : 500,
                background: activeFilter === 'ABSENT' ? '#EA580C' : '#F1F5F9',
                color: activeFilter === 'ABSENT' ? '#FFFFFF' : '#475569',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              불참 ({tally.absent})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('UNVOTED')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: activeFilter === 'UNVOTED' ? 700 : 500,
                background: activeFilter === 'UNVOTED' ? '#64748B' : '#F1F5F9',
                color: activeFilter === 'UNVOTED' ? '#FFFFFF' : '#475569',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              미투표 ({tally.unvoted})
            </button>
          </div>

          <input
            type="text"
            className="input-text"
            placeholder="단원 이름, 파트, 사유 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ minHeight: '36px', fontSize: '13px', padding: '6px 12px' }}
          />
        </div>

        {/* Vote List Scroll Area */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#FFFFFF' }}>
          {filteredRows.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              조건에 맞는 투표 내역이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredRows.map((r) => {
                const isAttended = r.voteStatus === 'ATTEND';
                const isAbsent = r.voteStatus === 'ABSENT';

                return (
                  <div
                    key={r.memberId}
                    className="rsvp-log-row"
                  >
                    {/* Left: Member Name, Part, Status */}
                    <div className="rsvp-log-member">
                      <strong style={{ color: '#1E293B', fontSize: '13.5px' }}>{r.memberName}</strong>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#475569',
                          background: '#E2E8F0',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {r.part}
                      </span>
                      {!r.isTarget && (
                        <span style={{ fontSize: '10.5px', color: '#059669', background: '#ECFDF5', padding: '1px 5px', borderRadius: '4px' }}>
                          자율
                        </span>
                      )}
                    </div>

                    {/* Middle: Vote Badge & Reason */}
                    <div className="rsvp-log-status" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '11.5px',
                          whiteSpace: 'nowrap',
                          background: isAttended
                            ? '#DCFCE7'
                            : isAbsent
                            ? '#FFEDD5'
                            : '#F1F5F9',
                          color: isAttended
                            ? '#15803D'
                            : isAbsent
                            ? '#C2410C'
                            : '#94A3B8',
                        }}
                      >
                        {isAttended ? '참석' : isAbsent ? '불참' : '미투표'}
                      </span>

                      {r.reason && (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#64748B',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={r.reason}
                        >
                          "{r.reason}"
                        </span>
                      )}
                    </div>

                    {/* Right: Timestamp */}
                    <div className="rsvp-log-time" style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {r.timestamp ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#334155', fontWeight: 600 }}>
                            {r.timestamp}
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>투표 제출</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#CBD5E1' }}>-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-primary-large"
            onClick={onClose}
            style={{ minHeight: '40px', padding: '6px 20px', fontSize: '13px' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
