import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member } from '../types/rollbook';
import {
  calculateCumulativeAttendanceWithLifecycle,
  getGamifiedAttendanceLevel,
} from '../utils/attendanceStats';
import { getKSTDateString } from '../utils/date';

interface MemberPortalModalProps {
  profile: BoundDeviceProfile;
  onClose: () => void;
  onChangeBinding: () => void;
  onLogout?: () => void;
  onRefreshData?: () => void;
}

const getTodayDateString = () => getKSTDateString();

export const MemberPortalModal: React.FC<MemberPortalModalProps> = ({
  profile,
  onClose,
  onChangeBinding,
  onLogout,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'RECORDS' | 'DASHBOARD'>('RECORDS');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [todayStr] = useState(getTodayDateString);

  // 1. 단원 프로필 조회 (ID 일치 우선, 실패 시 이름 일치로 구출)
  const members = sheetsService.getMembers();
  const currentMember: Member = useMemo(() => {
    const foundById = members.find((m) => m.id === profile.memberId);
    if (foundById) return foundById;
    const foundByName = members.find((m) => m.name === profile.name);
    if (foundByName) return foundByName;
    return {
      id: profile.memberId,
      name: profile.name,
      part: profile.part,
      phoneLast4: profile.phoneLast4,
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: '',
      joinedAt: '',
      memberStatus: '정단원',
    };
  }, [members, profile]);

  const memberPart = currentMember.part || profile.part;
  const memberName = currentMember.name || profile.name;

  const schedules = sheetsService.getSchedules();
  const allLogs = sheetsService.getLogs();

  // 2. 단원 생애주기 & 입단일 반영 누적 통계 산출
  const memberSummary = useMemo(() => {
    const summaries = calculateCumulativeAttendanceWithLifecycle([currentMember], schedules, allLogs);
    return (
      summaries[0] || {
        attendanceRate: 100,
        totalSessions: 0,
        attended: 0,
        late: 0,
        excused: 0,
        absent: 0,
        badges: [],
        guestAttended: 0,
      }
    );
  }, [currentMember, schedules, allLogs]);

  // 게이미피케이션 레벨 계산 (최신 시트 파트명 반영)
  const gamifiedLevel = useMemo(() => {
    return getGamifiedAttendanceLevel(memberSummary.attended, memberPart || '단원');
  }, [memberSummary.attended, memberPart]);

  // 3. 탭 1용: 회차별 통합 리스트 데이터 조립 [연습명칭 / 연습일 / 투표 상태 / 출결 시간]
  const scheduleRecords = useMemo(() => {
    // 최신 연습일정이 상단에 오도록 내림차순 정렬
    const sortedSchedules = [...schedules].sort((a, b) => b.date.localeCompare(a.date));

    return sortedSchedules.map((s) => {
      const rec = sheetsService.reconcileMemberAttendance(profile.memberId, s.id, profile.name);
      const isPast = s.date < todayStr;
      const isToday = s.date === todayStr;
      const isExempt = rec?.finalStatus === '미참' || rec?.finalStatus === '모수제외' || Boolean(currentMember.joinedAt && s.date < currentMember.joinedAt);

      let checkInTime = '-';
      const isAttended = rec?.finalStatus === '출석' || rec?.finalStatus === '수동인정' || rec?.finalStatus === '지각';

      if (rec?.checkInTime) {
        try {
          const d = new Date(rec.checkInTime);
          if (!isNaN(d.getTime())) {
            checkInTime = d.toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          } else if (rec.checkInTime.includes(':')) {
            checkInTime = rec.checkInTime.slice(0, 5);
          } else {
            checkInTime = rec.checkInTime;
          }
        } catch {
          checkInTime = rec.checkInTime;
        }
      } else if (rec?.finalStatus === '수동인정') {
        checkInTime = '수동인정';
      }

      return {
        id: s.id,
        title: s.title,
        date: s.date,
        category: s.category || '정기연습',
        voteStatus: rec?.rsvpStatus && rec.rsvpStatus !== 'UNVOTED' ? rec.rsvpStatus : null,
        voteReason: rec?.rsvpReason || '',
        isAttended,
        finalStatus: rec?.finalStatus || (isPast ? '결석' : '대기'),
        checkInTime,
        isPast,
        isToday,
        isExempt,
      };
    });
  }, [schedules, profile.memberId, profile.name, currentMember.joinedAt, todayStr]);

  // 4. 시트 동기화 핸들러
  const handleSyncRemote = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await sheetsService.fetchRemoteData();
      if (onRefreshData) onRefreshData();
      setSyncFeedback('✅ 구글 시트 최신 데이터와 동기화되었습니다.');
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: unknown) {
      setSyncFeedback(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ 동기화 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container member-portal-container-modern"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
        }}
      >
        {/* Modal Top Header */}
        <div
          style={{
            padding: '18px 22px 14px',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #2e2a72 100%)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`part-badge part-${memberPart}`}>{memberPart}</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  {memberName} <span style={{ fontSize: '13px', fontWeight: 500, color: '#cbd5e1' }}>단원 성적표</span>
                </h2>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {currentMember.memberStatus || '정단원'} · 입단일 {currentMember.joinedAt || '미등록'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-modal-round-close"
              onClick={onClose}
              aria-label="닫기"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: 'none' }}
            >
              ✕
            </button>
          </div>

          {/* 2-Tab Segmented Control */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '4px',
              borderRadius: '12px',
              marginTop: '14px',
              gap: '4px',
            }}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'RECORDS'}
              onClick={() => setActiveTab('RECORDS')}
              style={{
                flex: 1,
                minHeight: '38px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: activeTab === 'RECORDS' ? 700 : 500,
                cursor: 'pointer',
                background: activeTab === 'RECORDS' ? '#ffffff' : 'transparent',
                color: activeTab === 'RECORDS' ? '#1e1b4b' : '#cbd5e1',
                boxShadow: activeTab === 'RECORDS' ? '0 2px 5px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              📋 출결 기록 표
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'DASHBOARD'}
              onClick={() => setActiveTab('DASHBOARD')}
              style={{
                flex: 1,
                minHeight: '38px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: activeTab === 'DASHBOARD' ? 700 : 500,
                cursor: 'pointer',
                background: activeTab === 'DASHBOARD' ? '#ffffff' : 'transparent',
                color: activeTab === 'DASHBOARD' ? '#1e1b4b' : '#cbd5e1',
                boxShadow: activeTab === 'DASHBOARD' ? '0 2px 5px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              👤 개인 대시보드
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {syncFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: syncFeedback.startsWith('✅') ? '#ecfdf5' : '#fff1f2',
                color: syncFeedback.startsWith('✅') ? '#065f46' : '#9f1239',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {syncFeedback}
            </div>
          )}

          {/* TAB 1: 출결 기록 표 [연습명칭 / 연습일 / 투표 상태 / 출결 시간] */}
          {activeTab === 'RECORDS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Gamified Cumulative Attendance Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{gamifiedLevel.badgeEmoji}</span>
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e293b' }}>
                        이번 시즌 연습: 총 {memberSummary.attended}회 출석
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 700 }}>
                          칭호: {gamifiedLevel.currentLevelName}
                        </span>
                        <span style={{ fontSize: '11.5px', color: '#0f766e', fontWeight: 700, background: '#ccfbf1', padding: '1px 7px', borderRadius: '4px' }}>
                          나의 출석률 {memberSummary.attendanceRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                  {gamifiedLevel.nextLevelName && (
                    <span style={{ fontSize: '11.5px', color: '#64748b', background: '#ffffff', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                      다음 레벨까지 {gamifiedLevel.targetCount - gamifiedLevel.currentCount}회 남음
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${gamifiedLevel.progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Attendance Log Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Table Column Headers */}
                <div
                  className="scorecard-table-header"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(140px, 1.8fr) 100px 85px 85px',
                    background: '#f1f5f9',
                    padding: '10px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#475569',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <span>연습명칭</span>
                  <span>연습일</span>
                  <span style={{ textAlign: 'center' }}>투표 상태</span>
                  <span style={{ textAlign: 'right' }}>출결 시간</span>
                </div>

                {/* Table Body */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {scheduleRecords.length === 0 ? (
                    <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      등록된 연습 일정이 없습니다.
                    </div>
                  ) : (
                    scheduleRecords.map((r, idx) => (
                      <div
                        key={r.id}
                        className="scorecard-table-row"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 1.8fr) 100px 85px 85px',
                          alignItems: 'center',
                          padding: '11px 12px',
                          borderBottom: idx === scheduleRecords.length - 1 ? 'none' : '1px solid #f1f5f9',
                          background: r.isToday ? '#f0fdf4' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                          fontSize: '12.5px',
                        }}
                      >
                        {/* 1. 연습명칭 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              background: '#e0e7ff',
                              color: '#3730a3',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.category}
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              color: '#1e293b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={r.title}
                          >
                            {r.title}
                          </span>
                        </div>

                        {/* 2. 연습일 */}
                        <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace' }}>
                          {r.date}
                        </span>

                        {/* 3. 투표 상태 */}
                        <div style={{ textAlign: 'center' }}>
                          {r.voteStatus === 'ATTEND' ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '11.5px',
                              }}
                            >
                              참석
                            </span>
                          ) : r.voteStatus === 'ABSENT' ? (
                            <span
                              style={{
                                background: '#ffedd5',
                                color: '#c2410c',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '11.5px',
                              }}
                              title={r.voteReason ? `사유: ${r.voteReason}` : undefined}
                            >
                              불참
                            </span>
                          ) : r.voteStatus === 'LATE' ? (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '11.5px',
                              }}
                            >
                              지각
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#94a3b8',
                                padding: '3px 7px',
                                borderRadius: '6px',
                                fontSize: '11px',
                              }}
                            >
                              미투표
                            </span>
                          )}
                        </div>

                        {/* 4. 출결 시간 */}
                        <div style={{ textAlign: 'right' }}>
                          {r.isAttended ? (
                            <span
                              style={{
                                color: '#16a34a',
                                fontWeight: 700,
                                fontSize: '12px',
                                fontFamily: 'monospace',
                              }}
                            >
                              {r.checkInTime}
                            </span>
                          ) : r.isExempt ? (
                            <span style={{ color: '#94a3b8', fontSize: '11px' }}>미참</span>
                          ) : r.isPast ? (
                            <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '11.5px' }}>결석 (-)</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>대기</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 개인 대시보드 (자연어 브리핑 & 계정 관리) */}
          {activeTab === 'DASHBOARD' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 기본 소속 프로필 정보 */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px 18px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '13.5px', color: '#475569', fontWeight: 700 }}>
                  소속 및 인적사항
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>소속 파트</span>
                    <strong style={{ color: '#1e293b' }}>{memberPart}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>회원 구분</span>
                    <strong style={{ color: '#1e293b' }}>{currentMember.memberStatus || '정단원'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>입단 일자</span>
                    <strong style={{ color: '#1e293b' }}>{currentMember.joinedAt || '미등록'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>본인인증 PIN</span>
                    <strong style={{ color: '#1e293b' }}>끝자리 {profile.phoneLast4}</strong>
                  </div>
                </div>
                {currentMember.note && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '12.5px', color: '#64748b' }}>
                    비고: {currentMember.note}
                  </div>
                )}
              </div>

              {/* 기기 연동 및 계정 관리 */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px 18px',
                }}
              >
                <h3 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#475569', fontWeight: 700 }}>
                  기기 연동 및 계정 관리
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b' }}>
                  현재 사용 중인 스마트폰 기기가 본인 계정에 1인 1기기 락(Lock)으로 등록되어 있습니다.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSyncRemote}
                    disabled={isSyncing}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    <span>🔄</span>
                    <span>{isSyncing ? '동기화 중...' : '구글 시트 최신 데이터 동기화'}</span>
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={onChangeBinding}
                      style={{
                        flex: 1,
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '10px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer',
                      }}
                    >
                      다른 단원으로 재연동
                    </button>
                    {onLogout && (
                      <button
                        type="button"
                        onClick={onLogout}
                        style={{
                          flex: 1,
                          background: '#fff1f2',
                          border: '1px solid #fecdd3',
                          borderRadius: '10px',
                          padding: '10px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          color: '#e11d48',
                          cursor: 'pointer',
                        }}
                      >
                        🔓 기기 연동 해제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            style={{ minHeight: '42px', padding: '0 24px', fontSize: '13.5px' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberPortalModal;
