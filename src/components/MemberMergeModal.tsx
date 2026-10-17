import React, { useMemo, useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { Schedule } from '../types/rollbook';

interface MemberMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
  schedules: Schedule[];
}

export const MemberMergeModal: React.FC<MemberMergeModalProps> = ({
  isOpen,
  onClose,
  onMerged,
  schedules,
}) => {
  const duplicateGroups = useMemo(() => {
    if (!isOpen) return [];
    return sheetsService.findDuplicateMemberGroups();
  }, [isOpen]);

  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [overrideCanonicalId, setOverrideCanonicalId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSuccessMsg, setMergeSuccessMsg] = useState('');
  const [showTimeline, setShowTimeline] = useState(true);

  const currentGroup = duplicateGroups[selectedGroupIndex] || duplicateGroups[0];

  const allLogs = useMemo(() => {
    if (!isOpen) return [];
    return sheetsService.getLogs();
  }, [isOpen]);

  const allRsvps = useMemo(() => {
    if (!isOpen) return [];
    return sheetsService.getRSVPVotes();
  }, [isOpen]);

  const defaultCanonicalId = useMemo(() => {
    if (!currentGroup || currentGroup.members.length === 0) return '';
    const candidates = [...currentGroup.members].sort((a, b) => {
      const logsA = allLogs.filter((l) => l.memberId === a.id).length;
      const logsB = allLogs.filter((l) => l.memberId === b.id).length;
      if (logsB !== logsA) return logsB - logsA;
      return (a.joinedAt || a.createdAt).localeCompare(b.joinedAt || b.createdAt);
    });
    return candidates[0]?.id || '';
  }, [currentGroup, allLogs]);

  const selectedCanonicalId = overrideCanonicalId ?? defaultCanonicalId;

  if (!isOpen) return null;

  if (!currentGroup || duplicateGroups.length === 0) {
    return (
      <div className="modal-overlay">
        <div className="modal-card" style={{ maxWidth: '480px' }}>
          <div className="modal-header">
            <h2 className="modal-title">🎉 중복 등록 단원 없음</h2>
            <p className="modal-desc" style={{ marginTop: '8px' }}>
              현재 단원명부 내 이름과 전화번호가 중복된 계정이 없습니다. 모든 단원의 식별자가 고유하고 안전합니다.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary-large"
            onClick={onClose}
            style={{ minHeight: '44px', marginTop: '16px' }}
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  const groupMembers = currentGroup.members;
  const canonicalMember = groupMembers.find((m) => m.id === selectedCanonicalId) || groupMembers[0];
  const secondaryMembers = groupMembers.filter((m) => m.id !== selectedCanonicalId);

  const handleExecuteMerge = async () => {
    if (!canonicalMember || secondaryMembers.length === 0) return;

    try {
      setIsMerging(true);
      let totalLogs = 0;
      let totalRsvps = 0;

      for (const sec of secondaryMembers) {
        const res = await sheetsService.mergeDuplicateMembers(canonicalMember.id, sec.id);
        totalLogs += res.affectedLogsCount;
        totalRsvps += res.affectedRsvpCount;
      }

      setMergeSuccessMsg(
        `✅ [${canonicalMember.name}] 단원의 계정 통합 완료! 과거 출석 로그 ${totalLogs}건 및 투표 ${totalRsvps}건이 표준 ID(${canonicalMember.id})로 안전하게 귀속되었습니다.`
      );
      setTimeout(() => {
        setMergeSuccessMsg('');
        onMerged();
        onClose();
      }, 2500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '단원 계정 통합 중 오류가 발생했습니다.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-card" style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ textAlign: 'left', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#B45309',
                background: '#FEF3C7',
                padding: '3px 10px',
                borderRadius: '12px',
              }}
            >
              ⚠️ 중복 식별자 안전 통합
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
            >
              ✕
            </button>
          </div>
          <h2 className="modal-title" style={{ marginTop: '8px', fontSize: '19px' }}>
            [{currentGroup.name}] 단원 계정 & 출결 로그 통합
          </h2>
          <p className="modal-desc" style={{ marginTop: '4px', fontSize: '13px' }}>
            과거 기기 변경이나 재등록으로 분산된 출결 기록을 하나의 <strong>표준 대표 ID(Canonical ID)</strong>로 안전하게 모아줍니다.
          </p>
        </div>

        {mergeSuccessMsg && (
          <div className="success-banner" style={{ marginBottom: '16px', fontSize: '13.5px' }}>
            {mergeSuccessMsg}
          </div>
        )}

        {/* Group Selector if multiple duplicates exist */}
        {duplicateGroups.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <label className="form-label">중복 감지된 단원 선택 ({duplicateGroups.length}명)</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {duplicateGroups.map((grp, idx) => (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => {
                    setSelectedGroupIndex(idx);
                    setOverrideCanonicalId(null);
                  }}
                  className={`toss-filter-chip ${selectedGroupIndex === idx ? 'active' : ''}`}
                >
                  <span>{grp.name} ({grp.phoneLast4 || '----'}) · {grp.members.length}개</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Candidate Accounts Comparison Cards */}
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
            유지할 <strong>표준 대표 ID(Canonical ID)</strong>를 선택하세요:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {groupMembers.map((m) => {
              const logsCount = allLogs.filter((l) => l.memberId === m.id).length;
              const rsvpsCount = allRsvps.filter((v) => v.memberId === m.id).length;
              const isSelected = m.id === selectedCanonicalId;

              return (
                <div
                  key={m.id}
                  onClick={() => setOverrideCanonicalId(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                    background: isSelected ? '#EEF2FF' : '#F8FAFC',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="radio"
                      name="canonicalId"
                      checked={isSelected}
                      onChange={() => setOverrideCanonicalId(m.id)}
                      style={{ width: '18px', height: '18px', accentColor: '#4F46E5', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '14px', color: '#1E293B' }}>{m.name}</strong>
                        <span style={{ fontSize: '12px', color: '#475569', background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px' }}>
                          {m.part}
                        </span>
                        <span style={{ fontSize: '11px', color: '#6366F1', background: '#EEF2FF', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          ID: {m.id}
                        </span>
                        {isSelected && (
                          <span style={{ fontSize: '11px', color: '#059669', background: '#D1FAE5', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            ⭐ 대표 표준 ID로 채택
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                        가입일: {m.joinedAt || m.createdAt.slice(0, 10)} · 기기연동: {m.boundDeviceId ? '📱 등록됨' : '미등록'}
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'block' }}>
                      출석로그 {logsCount}건
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                      투표 {rsvpsCount}건
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Timeline / Activity Breakdown */}
        <div style={{ marginBottom: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowTimeline((prev) => !prev)}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              📊 회차별 활동 로그 대조 ({showTimeline ? '▲ 접기' : '▼ 펼치기'})
            </span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              총 {allLogs.filter((l) => groupMembers.some((m) => m.id === l.memberId)).length}회 활동
            </span>
          </div>

          {showTimeline && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
              {schedules
                .map((sch) => {
                  const matchingLogs = allLogs.filter(
                    (l) => l.scheduleId === sch.id && groupMembers.some((m) => m.id === l.memberId)
                  );
                  if (matchingLogs.length === 0) return null;

                  return (
                    <div
                      key={sch.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#2563EB', marginRight: '6px' }}>{sch.date}</strong>
                        <span style={{ color: '#1E293B' }}>{sch.title}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {matchingLogs.map((log) => (
                          <span
                            key={log.id}
                            style={{
                              background: log.authMethod === 'MANUAL_BY_ADMIN' ? '#FEF3C7' : '#DCFCE7',
                              color: log.authMethod === 'MANUAL_BY_ADMIN' ? '#B45309' : '#15803D',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '11px',
                            }}
                          >
                            [{log.memberId.slice(0, 8)}...] {log.authMethod === 'MANUAL_BY_ADMIN' ? '수동인정' : '출석'}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)}
            </div>
          )}
        </div>

        {/* Invariant & Safe Consolidation Notice */}
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#166534', lineHeight: 1.5 }}>
            🛡️ <strong>원천 로그 보존 불변식 보장:</strong><br />
            통합 시 과거의 출석 시간, GPS 인증 기록, 관리자 수동인정 메모는 전혀 삭제되지 않습니다. 선택하신 <strong>표준 ID({canonicalMember?.id})</strong>로 안전하게 외래키가 정규화되며, 통합된 보조 계정은 'MERGED(통합완료)' 상태로 구글 시트에 영구 보존됩니다.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-primary-large"
            onClick={handleExecuteMerge}
            disabled={isMerging || !selectedCanonicalId}
            style={{ flex: 1, minHeight: '44px' }}
          >
            {isMerging ? '시트 동기화 및 안전 통합 중...' : `🔗 [${canonicalMember?.name}] 표준 ID로 안전 통합 실행`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isMerging}
            style={{
              minHeight: '44px',
              padding: '0 18px',
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};
