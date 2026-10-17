import React, { useMemo, useState } from 'react';
import type { Member, Schedule, RawAttendanceLog, PartType, MemberStatus, RoleType, MemberStatusHistory } from '../types/rollbook';
import { formatMatrixHeaderDate, getKSTTimestampString } from '../utils/date';
import { sheetsService } from '../services/sheets';

interface MemberProfileModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Member, historyItem?: MemberStatusHistory) => Promise<void>;
  onDelete?: (memberId: string) => Promise<void>;
  schedules?: Schedule[];
  logs?: RawAttendanceLog[];
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = (props) => {
  if (!props.isOpen || !props.member) return null;
  return <MemberProfileModalContent key={props.member.id} {...props} member={props.member} />;
};

function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const getTodayDateString = () => getKSTTimestampString().slice(0, 10);

const MemberProfileModalContent: React.FC<MemberProfileModalProps & { member: Member }> = ({
  member,
  onClose,
  onSave,
  onDelete,
  schedules = [],
  logs: _logs = [],
}) => {
  const [todayStr] = useState(getTodayDateString);

  const [formData, setFormData] = useState<Member>(() => {
    const rawPhone = member.phone ? String(member.phone) : '';
    const rawLast4 = member.phoneLast4 !== undefined && member.phoneLast4 !== null
      ? String(member.phoneLast4)
      : (rawPhone ? rawPhone.replace(/\D/g, '').slice(-4) : '');
    return {
      ...member,
      name: String(member.name || ''),
      phone: rawPhone,
      phoneLast4: rawLast4,
      joinedAt: member.joinedAt ? String(member.joinedAt) : (member.createdAt ? String(member.createdAt).slice(0, 10) : ''),
      memberStatus: member.memberStatus || (member.role === 'ADMIN' ? '선생님' : '정단원'),
      note: member.note ? String(member.note) : '',
      statusHistory: member.statusHistory || [],
    };
  });

  const [initialData] = useState(() => ({
    name: String(member.name || ''),
    part: member.part,
    phone: member.phone ? String(member.phone) : '',
    phoneLast4: member.phoneLast4 !== undefined && member.phoneLast4 !== null ? String(member.phoneLast4) : '',
    memberStatus: member.memberStatus || (member.role === 'ADMIN' ? '선생님' : '정단원'),
    role: member.role,
    joinedAt: member.joinedAt ? String(member.joinedAt) : (member.createdAt ? String(member.createdAt).slice(0, 10) : ''),
    note: member.note ? String(member.note) : '',
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const [deviceSuccessMsg, setDeviceSuccessMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const STANDARD_PARTS = ['소프라노', '알토', '테너', '베이스', '선생님', '객원'];
  const [isCustomPart, setIsCustomPart] = useState(
    () => !STANDARD_PARTS.includes(formData.part) && Boolean(formData.part)
  );
  const [customPartInput, setCustomPartInput] = useState(() =>
    !STANDARD_PARTS.includes(formData.part) ? String(formData.part || '') : ''
  );

  // 단원 상태 표준 목록 및 토글 상태 관리
  const STANDARD_STATUSES = ['정단원', '준단원', '휴단원', '퇴단원', '선생님', '객원', '휴단', '퇴단'];
  const [isCustomStatus, setIsCustomStatus] = useState(
    () => Boolean(formData.memberStatus) && !STANDARD_STATUSES.includes(formData.memberStatus as string)
  );
  const [customStatusInput, setCustomStatusInput] = useState(() =>
    Boolean(formData.memberStatus) && !STANDARD_STATUSES.includes(formData.memberStatus as string)
      ? String(formData.memberStatus || '')
      : ''
  );

  const STATUS_TOGGLES: { label: string; value: MemberStatus; displayLabel: string; help: string }[] = [
    { label: '정단원', value: '정단원', displayLabel: '정단원', help: '모든 정규 연습 필참 대상' },
    { label: '준단원', value: '준단원', displayLabel: '준단원', help: '신입 / 수습 단원 (필참)' },
    { label: '휴단', value: '휴단원', displayLabel: '휴단', help: '일반 연습 제외 (지정 차출 시 필참)' },
    { label: '퇴단', value: '퇴단원', displayLabel: '퇴단', help: '출결 의무 영구 제외' },
    { label: '선생님', value: '선생님', displayLabel: '선생님', help: '지휘자 / 반주자 / 성악 코치' },
    { label: '객원', value: '객원', displayLabel: '객원', help: '연주 객원 단원' },
  ];

  const isStatusActive = (val: MemberStatus) => {
    if (isCustomStatus) return false;
    if (val === '휴단원') return formData.memberStatus === '휴단원' || formData.memberStatus === '휴단';
    if (val === '퇴단원') return formData.memberStatus === '퇴단원' || formData.memberStatus === '퇴단';
    return formData.memberStatus === val;
  };

  const handleSelectStatus = (newVal: MemberStatus) => {
    setIsCustomStatus(false);
    setFormData((prev) => ({ ...prev, memberStatus: newVal }));
    if (newVal !== initialData.memberStatus) {
      setRecordHistory(true);
    }
  };

  const handleSelectCustomStatus = () => {
    setIsCustomStatus(true);
    const val = customStatusInput.trim() || '기타';
    setFormData((prev) => ({ ...prev, memberStatus: val as MemberStatus }));
    setRecordHistory(true);
  };

  const handleCustomStatusInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomStatusInput(val);
    setFormData((prev) => ({ ...prev, memberStatus: (val.trim() || '기타') as MemberStatus }));
    setRecordHistory(true);
  };

  const getStatusAccentColor = (status?: string): string => {
    if (status === '휴단원' || status === '휴단') return '#d97706';
    if (status === '퇴단원' || status === '퇴단') return '#dc2626';
    if (status === '선생님') return '#7c3aed';
    if (status === '객원') return '#4f46e5';
    if (status === '준단원') return '#0d9488';
    return '#2563eb';
  };

  // 신규 이력 추가 폼 상태
  const [recordHistory, setRecordHistory] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState(getTodayDateString);
  const [historyEndDate, setHistoryEndDate] = useState('2999-12-31');
  const [historyReason, setHistoryReason] = useState('');

  // 기기 연동 초기화 핸들러 (1인 1기기 락 해제)
  const handleUnbindDevice = async () => {
    if (!window.confirm(`${formData.name} 단원의 기기 연동을 초기화하시겠습니까?\n초기화 후 새 스마트폰에서 다시 본인인증 바인딩이 가능합니다.`)) {
      return;
    }
    try {
      setIsUnbinding(true);
      setErrorMessage('');
      await sheetsService.unbindMemberDevice(formData.id);
      setFormData((prev) => ({
        ...prev,
        boundDeviceId: undefined,
        boundDeviceAt: undefined,
      }));
      setDeviceSuccessMsg('기기 연동이 성공적으로 초기화되었습니다.');
      setTimeout(() => setDeviceSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : '기기 연동 해제 중 오류가 발생했습니다.');
    } finally {
      setIsUnbinding(false);
    }
  };

  // 변경 사항(isDirty) 감지 (모든 필드 안전 문자열 변환 후 trim)
  const isDirty = useMemo(() => {
    return (
      String(formData.name || '').trim() !== String(initialData.name || '').trim() ||
      formData.part !== initialData.part ||
      String(formData.phone || '').trim() !== String(initialData.phone || '').trim() ||
      String(formData.phoneLast4 || '').trim() !== String(initialData.phoneLast4 || '').trim() ||
      formData.memberStatus !== initialData.memberStatus ||
      isCustomStatus ||
      formData.role !== initialData.role ||
      String(formData.joinedAt || '') !== String(initialData.joinedAt || '') ||
      String(formData.note || '').trim() !== String(initialData.note || '').trim() ||
      recordHistory
    );
  }, [formData, initialData, isCustomStatus, recordHistory]);

  // 안전 닫기 핸들러 (수정사항 존재 시 확인창 표시)
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // 단원의 출결 통계 계산 (중앙 엔진 reconcileMemberAttendance 기반 SSOT)
  const { attendedCount, attendanceRate } = useMemo(() => {
    let attended = 0;
    let requiredSessions = 0;

    schedules.forEach((s) => {
      const rec = sheetsService.reconcileMemberAttendance(formData.id, s.id);
      const isExempt = rec?.finalStatus === '모수제외' || Boolean(formData.joinedAt && s.date < formData.joinedAt);
      if (!isExempt) {
        requiredSessions++;
        if (rec?.finalStatus === '출석' || rec?.finalStatus === '수동인정') {
          attended += 1;
        } else if (rec?.finalStatus === '지각') {
          attended += 0.7;
        }
      } else if (rec?.finalStatus === '출석' || rec?.finalStatus === '수동인정') {
        requiredSessions++;
        attended += 1;
      }
    });

    const rate = requiredSessions > 0 ? Math.round((attended / requiredSessions) * 100) : 100;
    return { attendedCount: Math.floor(attended), attendanceRate: rate };
  }, [schedules, formData.id, formData.joinedAt]);

  // 최신순 일정 정렬
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => b.date.localeCompare(a.date));
  }, [schedules]);

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    const digits = formatted.replace(/\D/g, '');
    const last4 = digits.length >= 4 ? digits.slice(-4) : digits;
    setFormData((prev) => ({
      ...prev,
      phone: formatted,
      phoneLast4: last4,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(formData.name || '').trim()) {
      setErrorMessage('단원 이름을 입력해주세요.');
      return;
    }

    const digits = String(formData.phone || formData.phoneLast4 || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMessage('연락처는 전체 휴대폰 번호(10~11자리, 예: 010-1234-5678)를 정확히 입력해주세요.');
      return;
    }

    const finalPhone = formatPhoneNumber(digits);
    const finalLast4 = digits.slice(-4);
    const finalPart = isCustomPart ? (customPartInput.trim() || '기타') : formData.part;
    const finalStatus = isCustomStatus ? (customStatusInput.trim() || '기타') : (formData.memberStatus || '정단원');

    let newHistoryItem: MemberStatusHistory | undefined;
    const currentHistories = formData.statusHistory ? [...formData.statusHistory] : [];

    if (recordHistory) {
      newHistoryItem = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        memberId: formData.id,
        status: finalStatus as MemberStatus,
        part: finalPart as PartType,
        startDate: historyStartDate.trim() || todayStr,
        endDate: historyEndDate.trim() || '2999-12-31',
        reason: historyReason.trim(),
        createdAt: getKSTTimestampString(),
      };
      currentHistories.push(newHistoryItem);
    }

    const updatedMember: Member = {
      ...formData,
      name: String(formData.name || '').trim(),
      part: finalPart as PartType,
      memberStatus: finalStatus as MemberStatus,
      phone: finalPhone,
      phoneLast4: finalLast4,
      note: String(formData.note || '').trim(),
      statusHistory: currentHistories,
    };

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      await onSave(updatedMember, newHistoryItem);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !member) return;
    try {
      setIsSubmitting(true);
      await onDelete(member.id);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleAttemptClose}>
      <div
        className="modal-container member-profile-modal-modern"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header-modern">
          <div className="profile-header-meta">
            <span className="profile-pill-tag">{formData.part}</span>
            <div className="profile-header-title-wrap">
              <h2 className="modal-heading-name">{formData.name}</h2>
              <span className="modal-heading-sub">인적사항 상세</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-round-close"
            onClick={handleAttemptClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable">
          {errorMessage && (
            <div className="profile-alert-danger">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Quick Stats Summary Card (Toss Minimalist) */}
          <div className="profile-stats-card-modern">
            <div className="stat-col">
              <span className="stat-label-modern">누적 출석률</span>
              <strong className="stat-value-highlight">{attendanceRate}%</strong>
            </div>
            <div className="stat-v-divider" />
            <div className="stat-col">
              <span className="stat-label-modern">인정 출석</span>
              <strong className="stat-value-modern">{attendedCount}회</strong>
            </div>
            <div className="stat-v-divider" />
            <div className="stat-col">
              <span className="stat-label-modern">총 연습 회차</span>
              <strong className="stat-value-modern">{schedules.length}회</strong>
            </div>
          </div>

          {deviceSuccessMsg && (
            <div className="profile-alert-success" style={{ marginTop: '12px' }}>
              ✅ {deviceSuccessMsg}
            </div>
          )}

          {/* 1인 1기기 락 & 바인딩 상태 */}
          <div className="profile-device-lock-bar" style={{ marginTop: '14px' }}>
            <div className="device-lock-info">
              <span className="device-lock-icon">{formData.boundDeviceId ? '📱' : '📲'}</span>
              <div>
                <div className="device-lock-status">
                  {formData.boundDeviceId ? (
                    <>
                      <span className="device-badge-bound">1인 1기기 연동됨</span>
                      <span className="device-bind-date">({formData.boundDeviceAt ? formData.boundDeviceAt.slice(0, 10) : '등록됨'})</span>
                    </>
                  ) : (
                    <span className="device-badge-unbound">기기 미연동 (최초 1회 로그인 시 자동 연동)</span>
                  )}
                </div>
                <div className="device-lock-id">
                  {formData.boundDeviceId ? `기기 고유키: ...${formData.boundDeviceId.slice(-8)}` : '단원이 스마트폰에서 본인인증 시 자동 등록됩니다.'}
                </div>
              </div>
            </div>
            {formData.boundDeviceId && (
              <button
                type="button"
                className="btn-unbind-device"
                onClick={handleUnbindDevice}
                disabled={isUnbinding}
                title="기기 분실 또는 스마트폰 변경 시 연동을 초기화합니다."
              >
                {isUnbinding ? '해제 중...' : '🔓 기기 연동 초기화'}
              </button>
            )}
          </div>

          <form id="member-profile-form" onSubmit={handleSubmit} className="modern-form-wrapper">
            <div className="form-responsive-grid">
              <div className="modern-field-group">
                <label className="modern-field-label">단원명 *</label>
                <input
                  type="text"
                  className="modern-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 김하은"
                  required
                />
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">파트 *</label>
                <div className="modern-select-wrapper">
                  <select
                    className="modern-select"
                    value={isCustomPart ? '__CUSTOM__' : formData.part}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomPart(true);
                      } else {
                        setIsCustomPart(false);
                        setFormData({ ...formData, part: e.target.value as PartType });
                        setRecordHistory(true);
                      }
                    }}
                  >
                    {STANDARD_PARTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    {!STANDARD_PARTS.includes(formData.part) && Boolean(formData.part) && (
                      <option value={formData.part}>{formData.part} (기존 지정)</option>
                    )}
                    <option value="__CUSTOM__">✏️ 기타 (직접 입력)...</option>
                  </select>
                </div>
                {isCustomPart && (
                  <input
                    type="text"
                    className="modern-input"
                    style={{ marginTop: '8px' }}
                    value={customPartInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomPartInput(val);
                      setFormData((prev) => ({ ...prev, part: (val.trim() || '기타') as PartType }));
                      setRecordHistory(true);
                    }}
                    placeholder="새 파트명 직접 입력 (예: 카운터테너, 반주자, 임원)"
                    required={isCustomPart}
                    autoFocus
                  />
                )}
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">연락처 (전체 휴대폰 번호) *</label>
                <input
                  type="tel"
                  className="modern-input"
                  value={formData.phone || ''}
                  onChange={handlePhoneInputChange}
                  placeholder="010-0000-0000"
                  maxLength={13}
                  required
                />
                <span className="modern-input-hint">
                  ℹ️ 전체 휴대폰 번호를 저장합니다. 기기 인증 시에는 뒷 4자리(<strong>{formData.phoneLast4 || '----'}</strong>)를 사용합니다.
                </span>
              </div>

              <div className="modern-field-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="modern-field-label">단원 상태 구분</label>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    선택: <strong style={{ color: getStatusAccentColor(formData.memberStatus) }}>{formData.memberStatus || '정단원'}</strong>
                  </span>
                </div>

                {/* 단원 상태 토글 버튼 바 */}
                <div className="status-toggle-group">
                  {STATUS_TOGGLES.map((opt) => {
                    const active = isStatusActive(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        className={`status-toggle-btn status-${opt.value} ${active ? 'active' : ''}`}
                        onClick={() => handleSelectStatus(opt.value)}
                        title={opt.help}
                      >
                        {opt.displayLabel}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`status-toggle-btn status-custom ${isCustomStatus ? 'active' : ''}`}
                    onClick={handleSelectCustomStatus}
                    title="기타 상태 직접 입력"
                  >
                    ✏️ 기타 (직접입력)
                  </button>
                </div>

                {isCustomStatus && (
                  <input
                    type="text"
                    className="modern-input"
                    style={{ marginTop: '8px' }}
                    value={customStatusInput}
                    onChange={handleCustomStatusInputChange}
                    placeholder="새 상태 구분 직접 입력 (예: 명예단원, 군휴학, 고문)"
                    required={isCustomStatus}
                    autoFocus
                  />
                )}

                {/* 상태/파트 변경 이력 기간 및 사유 설정 */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '14px',
                    background: recordHistory ? '#f0f5ff' : '#f8f9fe',
                    border: `1.5px solid ${recordHistory ? '#bfdbfe' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: recordHistory ? '#1e40af' : '#334155',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={recordHistory}
                      onChange={(e) => setRecordHistory(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>
                      🕒 [{formData.memberStatus || '정단원'}] 상태 변경 이력 기록 (시트 DB 저장)
                    </span>
                  </label>

                  {recordHistory && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 12px',
                          background: '#ffffff',
                          borderRadius: '6px',
                          border: '1px solid #dbeafe',
                          fontSize: '0.82rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ color: '#64748b', fontWeight: 600 }}>적용될 상태:</span>
                        <span style={{ fontWeight: 800, color: getStatusAccentColor(formData.memberStatus) }}>
                          {formData.memberStatus || '정단원'}
                        </span>
                        {formData.memberStatus !== initialData.memberStatus && (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            ({initialData.memberStatus || '기존'} ➔ {formData.memberStatus})
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: '#6b7280' }}>
                          {formData.memberStatus === '휴단원' || formData.memberStatus === '휴단'
                            ? '출결 모수 제외 (차출 시 필참)'
                            : formData.memberStatus === '퇴단원' || formData.memberStatus === '퇴단'
                            ? '출결 의무 영구 제외'
                            : '정규 필참 대상'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '130px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>적용 시작일</span>
                          <input
                            type="date"
                            className="modern-input"
                            style={{ height: '38px', fontSize: '0.85rem', marginTop: '3px' }}
                            value={historyStartDate}
                            onChange={(e) => setHistoryStartDate(e.target.value)}
                          />
                        </div>
                        <span style={{ marginTop: '18px', color: '#94a3b8' }}>~</span>
                        <div style={{ flex: 1, minWidth: '130px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>적용 종료일</span>
                          <input
                            type="text"
                            className="modern-input"
                            style={{ height: '38px', fontSize: '0.85rem', marginTop: '3px' }}
                            value={historyEndDate}
                            onChange={(e) => setHistoryEndDate(e.target.value)}
                            placeholder="YYYY-MM-DD"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoryEndDate('2999-12-31')}
                          style={{
                            marginTop: '18px',
                            height: '38px',
                            padding: '0 12px',
                            background: historyEndDate === '2999-12-31' ? '#4f46e5' : '#e2e8f0',
                            color: historyEndDate === '2999-12-31' ? '#fff' : '#475569',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ♾️ 영구 적용
                        </button>
                      </div>

                      <div>
                        <input
                          type="text"
                          className="modern-input"
                          style={{ height: '38px', fontSize: '0.85rem' }}
                          value={historyReason}
                          onChange={(e) => setHistoryReason(e.target.value)}
                          placeholder={
                            formData.memberStatus === '휴단원' || formData.memberStatus === '휴단'
                              ? '휴단 사유 입력 (예: 개인 사정, 건강, 출산, 학업 등)'
                              : formData.memberStatus === '퇴단원' || formData.memberStatus === '퇴단'
                              ? '퇴단 사유 입력 (예: 이사, 개인 사정, 직장 이직 등)'
                              : initialData.memberStatus === '휴단원' || initialData.memberStatus === '휴단'
                              ? '복단 사유 입력 (예: 휴단 기간 만료 후 정규 복귀)'
                              : '변경 사유 입력 (예: 파트 이동, 직책 변경 등)'
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">시스템 역할</label>
                <div className="modern-select-wrapper">
                  <select
                    className="modern-select"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as RoleType })
                    }
                  >
                    <option value="MEMBER">일반 단원 (MEMBER)</option>
                    <option value="ADMIN">관리자/선생님 (ADMIN)</option>
                    <option value="GUEST">객원 (GUEST)</option>
                  </select>
                </div>
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">입단일</label>
                <input
                  type="date"
                  className="modern-input"
                  value={formData.joinedAt || ''}
                  onChange={(e) => setFormData({ ...formData, joinedAt: e.target.value })}
                />
              </div>
            </div>

            <div className="modern-field-group" style={{ marginTop: '12px' }}>
              <label className="modern-field-label">특이사항 / 메모 (직책, 담당 역할 등)</label>
              <textarea
                className="modern-textarea"
                rows={2}
                value={formData.note || ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="예: 파트장, 악보계, 총무, 10월 둘째주 해외출장 등"
              />
            </div>
          </form>

          {/* Status & Part Lifecycle History Timeline */}
          {formData.statusHistory && formData.statusHistory.length > 0 && (
            <div className="profile-section-block" style={{ marginTop: '16px', marginBottom: '16px' }}>
              <div className="attendance-section-title-row">
                <h4 className="section-title-compact">🕒 상태 및 파트 변경 이력</h4>
                <span className="section-subtitle-compact">총 {formData.statusHistory.length}건 기록됨</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {formData.statusHistory.map((hist, idx) => (
                  <div
                    key={hist.id || idx}
                    style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>
                          {hist.status} ({hist.part})
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {hist.startDate} ~ {hist.endDate === '2999-12-31' ? '영구' : hist.endDate}
                        </span>
                      </div>
                      {hist.reason && (
                        <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                          💬 {hist.reason}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {hist.createdAt ? hist.createdAt.slice(0, 10) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Attendance Records List (Scrollable List) */}
          <div className="profile-attendance-section">
            <div className="attendance-section-title-row">
              <h4 className="section-title-compact">📋 출결 기록</h4>
              <span className="section-subtitle-compact">
                총 {schedules.length}회차 중 인정 출석 {attendedCount}회
              </span>
            </div>

            {sortedSchedules.length > 0 ? (
              <div className="attendance-list-table-card">
                <div className="attendance-list-table-header">
                  <span className="col-head col-date">날짜</span>
                  <span className="col-head col-title">일정명</span>
                  <span className="col-head col-status">출결 상태</span>
                </div>
                <div className="attendance-list-scroll-body">
                  {sortedSchedules.map((sch) => {
                    const headerDate = formatMatrixHeaderDate(sch.date);
                    const rec = sheetsService.reconcileMemberAttendance(formData.id, sch.id);
                    const status = rec?.finalStatus || '결석';
                    const isAttend = status === '출석' || status === '수동인정';
                    const isLate = status === '지각';
                    const isExcused = status === '사유결석';
                    const isExempt = status === '모수제외';

                    let badgeClass = 'badge-absent';
                    if (isAttend) badgeClass = 'badge-attend';
                    else if (isLate) badgeClass = 'badge-late';
                    else if (isExcused) badgeClass = 'badge-excused';
                    else if (isExempt) badgeClass = 'badge-exempt';

                    return (
                      <div key={sch.id} className="attendance-record-row">
                        <span className="col-cell col-date">
                          <strong>{headerDate.dateLabel}</strong>
                        </span>
                        <div className="col-cell col-title">
                          <span className="record-sch-title">{sch.title}</span>
                          <span className="record-sch-cat">{sch.category}</span>
                        </div>
                        <div className="col-cell col-status">
                          <span className={`record-badge ${badgeClass}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="attendance-empty-box">등록된 연습 일정이 없습니다.</div>
            )}
          </div>

          {/* Delete Danger Section */}
          {showDeleteConfirm ? (
            <div className="profile-delete-confirm-box">
              <p className="delete-confirm-text">
                정말로 <strong>{formData.name}</strong> 단원을 명부에서 삭제하시겠습니까?
                <br />
                구글 스프레드시트 단원명부 행도 함께 삭제됩니다.
              </p>
              <div className="delete-confirm-btn-row">
                <button
                  type="button"
                  className="btn-cancel-action"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isSubmitting}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn-danger-confirm"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '삭제 중...' : '확인, 완전히 삭제'}
                </button>
              </div>
            </div>
          ) : (
            onDelete && (
              <div className="profile-delete-trigger-row">
                <button
                  type="button"
                  className="btn-text-danger-link"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting}
                >
                  🗑️ 단원 삭제하기
                </button>
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer-modern">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={handleAttemptClose}
            disabled={isSubmitting}
          >
            닫기
          </button>
          <button
            type="submit"
            form="member-profile-form"
            className="btn-modal-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '💾 인적사항 저장'}
          </button>
        </div>

        {/* Discard Unsaved Changes Confirm Dialog */}
        {showDiscardConfirm && (
          <div className="nested-confirm-overlay" onClick={() => setShowDiscardConfirm(false)}>
            <div className="nested-confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3 className="nested-confirm-title">변경된 내용을 저장하지 않고 닫으시겠습니까?</h3>
              <p className="nested-confirm-desc">
                작성 중이던 수정사항이 모두 초기화됩니다. 계속 진행하시겠습니까?
              </p>
              <div className="nested-confirm-btn-row">
                <button
                  type="button"
                  className="btn-keep-editing"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  계속 작성하기
                </button>
                <button
                  type="button"
                  className="btn-discard-exit"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                >
                  저장 안 하고 닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

