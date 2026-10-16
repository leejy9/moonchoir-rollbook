import React, { useMemo, useState } from 'react';
import type { Member, Schedule, RawAttendanceLog, PartType, MemberStatus, RoleType } from '../types/rollbook';
import { formatMatrixHeaderDate } from '../utils/date';

interface MemberProfileModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Member) => Promise<void>;
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

const MemberProfileModalContent: React.FC<MemberProfileModalProps & { member: Member }> = ({
  member,
  onClose,
  onSave,
  onDelete,
  schedules = [],
  logs = [],
}) => {
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 변경 사항(isDirty) 감지 (모든 필드 안전 문자열 변환 후 trim)
  const isDirty = useMemo(() => {
    return (
      String(formData.name || '').trim() !== String(initialData.name || '').trim() ||
      formData.part !== initialData.part ||
      String(formData.phone || '').trim() !== String(initialData.phone || '').trim() ||
      String(formData.phoneLast4 || '').trim() !== String(initialData.phoneLast4 || '').trim() ||
      formData.memberStatus !== initialData.memberStatus ||
      formData.role !== initialData.role ||
      String(formData.joinedAt || '') !== String(initialData.joinedAt || '') ||
      String(formData.note || '').trim() !== String(initialData.note || '').trim()
    );
  }, [formData, initialData]);

  // 안전 닫기 핸들러 (수정사항 존재 시 확인창 표시)
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // 단원의 출결 통계 계산
  const memberLogs = logs.filter((l) => l.memberId === formData.id);
  const attendedCount = memberLogs.filter(
    (l) => l.authMethod !== 'MANUAL_BY_ADMIN' || !l.adminNote?.includes('결석')
  ).length;
  const attendanceRate = schedules.length > 0
    ? Math.round((attendedCount / schedules.length) * 100)
    : 100;

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
    if (digits.length < 4) {
      setErrorMessage('연락처는 최소 4자리 이상(인증용 뒷자리) 입력해야 합니다.');
      return;
    }

    const finalLast4 = digits.slice(-4);
    const updatedMember: Member = {
      ...formData,
      name: String(formData.name || '').trim(),
      phone: String(formData.phone || '').trim(),
      phoneLast4: finalLast4,
      note: String(formData.note || '').trim(),
    };

    try {
      setIsSubmitting(true);
      setErrorMessage('');
      await onSave(updatedMember);
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
                    value={formData.part}
                    onChange={(e) => setFormData({ ...formData, part: e.target.value as PartType })}
                  >
                    <option value="소프라노">소프라노</option>
                    <option value="알토">알토</option>
                    <option value="테너">테너</option>
                    <option value="베이스">베이스</option>
                    <option value="선생님">선생님</option>
                    <option value="객원">객원</option>
                  </select>
                </div>
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">연락처 (휴대폰 번호) *</label>
                <input
                  type="tel"
                  className="modern-input"
                  value={formData.phone || ''}
                  onChange={handlePhoneInputChange}
                  placeholder="010-0000-0000"
                  maxLength={13}
                />
                <span className="modern-input-hint">
                  ℹ️ 본인 확인 및 기기 연결 시에는 뒷 4자리(<strong>{formData.phoneLast4 || '----'}</strong>)로 인증합니다.
                </span>
              </div>

              <div className="modern-field-group">
                <label className="modern-field-label">단원 상태 구분</label>
                <div className="modern-select-wrapper">
                  <select
                    className="modern-select"
                    value={formData.memberStatus || '정단원'}
                    onChange={(e) =>
                      setFormData({ ...formData, memberStatus: e.target.value as MemberStatus })
                    }
                  >
                    <option value="정단원">정단원</option>
                    <option value="준단원">준단원 (신입)</option>
                    <option value="휴단원">휴단원</option>
                    <option value="객원">객원</option>
                    <option value="선생님">선생님 (지휘/반주)</option>
                    <option value="퇴단원">퇴단원</option>
                  </select>
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
                rows={3}
                value={formData.note || ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="예: 파트장, 악보계, 총무, 10월 둘째주 해외출장 등"
              />
            </div>
          </form>

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
                    const logItem = memberLogs.find((l) => l.scheduleId === sch.id);
                    const isAttended = !!logItem;

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
                          <span className={`record-badge ${isAttended ? 'badge-attend' : 'badge-absent'}`}>
                            {isAttended ? '출석' : '결석'}
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

