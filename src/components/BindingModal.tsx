import React, { useMemo, useState } from 'react';
import { bindDeviceProfile, getOrCreateDeviceId } from '../services/auth';
import { ExistingMemberConflictError, sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, PartType } from '../types/rollbook';
import { buildNewMember } from '../utils/newMember';
import moonchoirLogo from '../assets/moonchoir-logo.png';

interface BindingModalProps {
  onSuccess: (profile: BoundDeviceProfile) => void;
  onClose?: () => void;
}

function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export const BindingModal: React.FC<BindingModalProps> = ({ onSuccess, onClose }) => {
  const [tab, setTab] = useState<'SELECT' | 'REGISTER'>('SELECT');
  const [selectedPartFilter, setSelectedPartFilter] = useState<string>('전체');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Selection mode state
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicatePromptMember, setDuplicatePromptMember] = useState<Member | null>(null);
  const [pendingNewMember, setPendingNewMember] = useState<Member | null>(null);

  // Register mode state
  const [newName, setNewName] = useState('');
  const availableParts = useMemo(() => sheetsService.getParts(), []);
  const [newPart, setNewPart] = useState<string>(availableParts[0] || '소프라노');
  const [customPart, setCustomPart] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const members = sheetsService.getMembers().filter((m) => m.status === 'ACTIVE');

  // Filter members by part and search keyword
  const filteredMembers = members.filter((m) => {
    const matchPart = selectedPartFilter === '전체' || m.part === selectedPartFilter;
    const matchKeyword = !searchKeyword.trim() || m.name.toLowerCase().includes(searchKeyword.trim().toLowerCase());
    return matchPart && matchKeyword;
  });

  // Handle phone input formatting in register mode
  const handleRegisterPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPhone(formatPhoneNumber(e.target.value));
  };

  // Handle phone input formatting in select mode (require full 010 number)
  const handleSelectPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneInput(formatPhoneNumber(e.target.value));
  };

  const handleSelectMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedMember) {
      setErrorMsg('단원을 먼저 선택해 주세요.');
      return;
    }

    const inputDigits = phoneInput.replace(/\D/g, '');
    if (inputDigits.length < 10) {
      setErrorMsg('연락처는 010으로 시작하는 전체 휴대폰 번호(10~11자리)를 정확히 입력해 주세요.');
      return;
    }

    const inputLast4 = inputDigits.slice(-4);
    const targetLast4 = String(selectedMember.phoneLast4 || '').trim();

    // Check last 4 digits against registered member
    const isUnsetLast4 = !targetLast4 || targetLast4 === '0000' || targetLast4 === '----';
    let effectiveLast4 = targetLast4;

    if (isUnsetLast4) {
      effectiveLast4 = inputLast4;
    } else if (inputLast4 !== targetLast4) {
      setErrorMsg(`입력하신 번호의 뒷자리(${inputLast4})가 단원 명부에 등록된 정보(${targetLast4})와 일치하지 않습니다.`);
      return;
    }

    const currentDeviceId = getOrCreateDeviceId();
    if (selectedMember.boundDeviceId && selectedMember.boundDeviceId !== currentDeviceId) {
      setErrorMsg(
        `이미 다른 기기(스마트폰)에 연동되어 있는 계정입니다.\n기존 기기에서 [연동 해제]를 먼저 진행하셨거나 기기 교체 시 관리자에게 초기화를 요청하세요.`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      // Always store full formatted phone number and last4
      const fullPhoneFormatted = formatPhoneNumber(inputDigits);
      await sheetsService.bindExistingMember(
        selectedMember.id,
        currentDeviceId,
        fullPhoneFormatted,
        inputLast4
      );
      const profile = bindDeviceProfile(
        selectedMember.id,
        selectedMember.name,
        selectedMember.part,
        effectiveLast4,
        currentDeviceId
      );
      onSuccess(profile);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '기기 연동 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('이름(실명)을 입력해 주세요.');
      return;
    }

    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMsg('연락처는 010으로 시작하는 전체 11자리(또는 10자리)를 입력해 주세요.');
      return;
    }

    const finalLast4 = digits.slice(-4);
    const finalPart: PartType = newPart === '기타' ? (customPart.trim() || '기타') : (newPart as PartType);
    const currentDeviceId = getOrCreateDeviceId();

    // Deduplication check: if member with identical name already exists in members list
    const existingMember = members.find(
      (m) =>
        m.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (m.phoneLast4 === finalLast4 || !m.phoneLast4 || m.phoneLast4 === '0000')
    );

    if (existingMember) {
      setDuplicatePromptMember(existingMember);
      return;
    }

    const newMember =
      pendingNewMember &&
      pendingNewMember.name === trimmedName &&
      pendingNewMember.part === finalPart &&
      pendingNewMember.phone === formatPhoneNumber(digits)
        ? pendingNewMember
        : buildNewMember(trimmedName, finalPart, formatPhoneNumber(digits), finalLast4, currentDeviceId);

    try {
      setIsSubmitting(true);
      setPendingNewMember(newMember);
      await sheetsService.registerAndBindMember(newMember, currentDeviceId);

      const profile = bindDeviceProfile(
        newMember.id,
        newMember.name,
        newMember.part,
        newMember.phoneLast4,
        currentDeviceId
      );

      setPendingNewMember(null);
      onSuccess(profile);
    } catch (err: unknown) {
      if (err instanceof ExistingMemberConflictError) {
        try {
          await sheetsService.fetchRemoteData();
          const existing = sheetsService.getMembers().find((member) => member.id === err.existingMemberId);
          if (existing) {
            setDuplicatePromptMember(existing);
            return;
          }
        } catch (refreshError) {
          const refreshMessage =
            refreshError instanceof Error ? refreshError.message : '명부 동기화에 실패했습니다.';
          setErrorMsg(`${err.message} 최신 명부 확인도 실패했습니다: ${refreshMessage}`);
          return;
        }
      }
      setErrorMsg(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExistingBinding = async (targetMember: Member) => {
    const currentDeviceId = getOrCreateDeviceId();
    const digits = newPhone.replace(/\D/g, '');
    const finalPhone = formatPhoneNumber(digits);
    const finalLast4 = digits.length >= 4 ? digits.slice(-4) : (targetMember.phoneLast4 || '0000');

    // Enforce 1-person 1-device lock consistently even from duplicate registration prompt
    if (targetMember.boundDeviceId && targetMember.boundDeviceId !== currentDeviceId) {
      setDuplicatePromptMember(null);
      setErrorMsg(
        '이미 다른 기기(스마트폰)에 연동되어 있는 계정입니다.\n기존 기기에서 [연동 해제]를 먼저 진행하셨거나 기기 교체 시 관리자에게 초기화를 요청하세요.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      await sheetsService.bindExistingMember(
        targetMember.id,
        currentDeviceId,
        finalPhone || targetMember.phone || '',
        finalLast4
      );
      const profile = bindDeviceProfile(
        targetMember.id,
        targetMember.name,
        targetMember.part,
        finalLast4,
        currentDeviceId
      );
      onSuccess(profile);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '기존 단원 계정 연동 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const registerPhoneDigits = newPhone.replace(/\D/g, '');
  const derivedLast4 = registerPhoneDigits.length >= 4 ? registerPhoneDigits.slice(-4) : '';

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <img
            src={moonchoirLogo}
            alt="Moonchoir"
            style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px', display: 'block', objectFit: 'cover', boxShadow: '0 4px 12px rgba(91, 62, 150, 0.2)' }}
          />
          <div className="modal-badge">1회 본인 기기 등록</div>
          <h2 className="modal-title">본인 확인 & 기기 연결</h2>
          <p className="modal-desc">
            한 번만 등록해 두면, 앞으로 연습실 상설 QR을 비출 때마다 대리 출석 걱정 없이 1초 만에 바로 출석됩니다!
          </p>
        </div>

        <div className="tab-pill-group" style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className={`tab-pill ${tab === 'SELECT' ? 'active' : ''}`}
            onClick={() => { setTab('SELECT'); setErrorMsg(''); }}
          >
            기존 명부에서 찾기
          </button>
          <button
            type="button"
            className={`tab-pill ${tab === 'REGISTER' ? 'active' : ''}`}
            onClick={() => { setTab('REGISTER'); setErrorMsg(''); }}
          >
            신규 단원 / 객원 등록
          </button>
        </div>

        {errorMsg && <div className="error-banner" style={{ marginBottom: '14px' }}>⚠️ {errorMsg}</div>}

        {tab === 'SELECT' ? (
          <div>
            {!selectedMember ? (
              <>
                <div className="filter-scroll-row">
                  {['전체', ...availableParts].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`filter-chip ${selectedPartFilter === p ? 'active' : ''}`}
                      onClick={() => setSelectedPartFilter(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    className="modern-input"
                    style={{ minHeight: '40px', fontSize: '13px' }}
                    placeholder="🔍 이름 검색 (예: 김하은)"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
                  <span style={{ fontSize: '12px', color: '#718096' }}>등록 단원 {filteredMembers.length}명</span>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        await sheetsService.fetchRemoteData();
                      } catch (e) {
                        console.warn(e);
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting}
                    style={{ background: 'transparent', border: 'none', color: '#5B3E96', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, padding: '4px 8px' }}
                  >
                    {isSubmitting ? '동기화 중...' : '🔄 시트 명부 새로고침'}
                  </button>
                </div>

                <div className="member-picker-list">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="member-picker-item"
                        onClick={() => { setSelectedMember(m); setErrorMsg(''); setPhoneInput(''); }}
                      >
                        <span className={`part-badge part-${m.part}`}>{m.part}</span>
                        <span className="member-picker-name">{m.name}</span>
                        <span className="member-picker-arrow">선택 ➔</span>
                      </button>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 10px', color: '#718096', fontSize: '13px' }}>
                      해당하는 단원이 없습니다. [신규 단원 등록] 탭에서 등록해 주세요.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleSelectMemberSubmit} className="form-stack">
                <div className="selected-card" style={{ marginBottom: '16px' }}>
                  <span className={`part-badge part-${selectedMember.part}`}>{selectedMember.part}</span>
                  <span className="selected-name" style={{ fontSize: '16px' }}>{selectedMember.name} 단원님</span>
                  <button
                    type="button"
                    className="btn-change"
                    onClick={() => { setSelectedMember(null); setPhoneInput(''); setErrorMsg(''); }}
                  >
                    다른 단원 선택
                  </button>
                </div>

                <label className="form-label" htmlFor="phone-last4" style={{ fontWeight: 600, fontSize: '13.5px' }}>
                  연락처 확인 (휴대폰 전체 번호 입력) *
                </label>
                <input
                  id="phone-last4"
                  type="tel"
                  className="modern-input"
                  placeholder="010-0000-0000"
                  value={phoneInput}
                  onChange={handleSelectPhoneChange}
                  maxLength={13}
                  autoFocus
                  required
                />
                <span className="binding-input-hint">
                  ℹ️ 전체 연락처가 시트에 온전히 저장되며, 뒷 4자리로 본인 여부를 안전하게 확인합니다.
                </span>

                <button type="submit" className="btn-primary-large" style={{ marginTop: '16px' }}>
                  내 폰으로 등록 완료
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="form-stack">
            {duplicatePromptMember && (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1.5px solid #FCD34D',
                  padding: '16px',
                  borderRadius: '12px',
                  marginBottom: '16px',
                }}
              >
                <h4 style={{ margin: '0 0 6px', color: '#B45309', fontSize: '15px', fontWeight: 800 }}>
                  ⚠️ 이미 등록된 단원 계정 감지
                </h4>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#78350F', lineHeight: 1.5 }}>
                  <strong>[{duplicatePromptMember.name}]</strong> 단원님 ({duplicatePromptMember.part}, 뒷자리 {duplicatePromptMember.phoneLast4 || derivedLast4}) 계정이 이미 명부에 존재합니다.
                  {duplicatePromptMember.boundDeviceId && duplicatePromptMember.boundDeviceId !== getOrCreateDeviceId() ? (
                    <span style={{ display: 'block', marginTop: '6px', color: '#DC2626', fontWeight: 600 }}>
                      * 이전에 다른 브라우저/기기에 연동된 이력이 있습니다. 현재 사용 중인 이 기기로 연동을 이전(재인증)하시겠습니까?
                    </span>
                  ) : (
                    <span style={{ display: 'block', marginTop: '6px' }}>
                      * 새로운 중복 계정을 생성하지 않고, 기존 계정에 내 기기를 안전하게 연결합니다.
                    </span>
                  )}
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleConfirmExistingBinding(duplicatePromptMember)}
                    disabled={isSubmitting}
                    style={{
                      background: '#D97706',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flex: 1,
                      minHeight: '44px',
                    }}
                  >
                    🔗 예, 내 계정으로 연동하기
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicatePromptMember(null)}
                    disabled={isSubmitting}
                    style={{
                      background: '#FFFFFF',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: '44px',
                    }}
                  >
                    취소 및 다시 입력
                  </button>
                </div>
              </div>
            )}
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" htmlFor="reg-name" style={{ fontWeight: 600, fontSize: '13.5px' }}>
                이름 (실명) *
              </label>
              <input
                id="reg-name"
                type="text"
                className="modern-input"
                placeholder="예: 이재연"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '13.5px' }}>
                파트 구분 *
              </label>
              <div className="part-chips-grid">
                {availableParts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`part-chip-btn ${newPart === p ? 'active' : ''}`}
                    onClick={() => setNewPart(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={`part-chip-btn ${newPart === '기타' ? 'active' : ''}`}
                  onClick={() => setNewPart('기타')}
                >
                  기타 (직접입력)
                </button>
              </div>

              {newPart === '기타' && (
                <input
                  type="text"
                  className="modern-input"
                  style={{ marginTop: '8px' }}
                  placeholder="파트명 직접 입력 (예: 카운터테너, 피아노, 임원)"
                  value={customPart}
                  onChange={(e) => setCustomPart(e.target.value)}
                  autoFocus
                  required
                />
              )}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label className="form-label" htmlFor="reg-phone" style={{ fontWeight: 600, fontSize: '13.5px' }}>
                연락처 (휴대폰 번호 전체) *
              </label>
              <input
                id="reg-phone"
                type="tel"
                className="modern-input"
                placeholder="010-0000-0000"
                value={newPhone}
                onChange={handleRegisterPhoneChange}
                maxLength={13}
                required
              />
              <span className="binding-input-hint">
                ℹ️ 연락처 전체(11자리)를 입력해주세요. 연습실 출석 및 본인 확인 시에는 뒷 4자리(<strong>{derivedLast4 || '----'}</strong>)로 인증됩니다.
              </span>
            </div>

            <button
              type="submit"
              className="btn-primary-large"
              disabled={isSubmitting}
            >
              {isSubmitting ? '구글 시트 저장 및 기기 연결 중...' : '신규 등록하고 내 폰으로 바인딩'}
            </button>
          </form>
        )}

        {onClose && (
          <button type="button" className="btn-secondary-cancel" onClick={onClose} style={{ marginTop: '10px' }}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
};
