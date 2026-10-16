import React, { useState } from 'react';
import { bindDeviceProfile } from '../services/auth';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, Member, PartType } from '../types/rollbook';

interface BindingModalProps {
  onSuccess: (profile: BoundDeviceProfile) => void;
  onClose?: () => void;
}

const DEFAULT_PARTS: PartType[] = ['소프라노', '알토', '테너', '베이스', '선생님', '객원'];

export const BindingModal: React.FC<BindingModalProps> = ({ onSuccess, onClose }) => {
  const [tab, setTab] = useState<'SELECT' | 'REGISTER'>('SELECT');
  const [selectedPartFilter, setSelectedPartFilter] = useState<string>('전체');

  // Selection mode state
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Register mode state
  const [newName, setNewName] = useState('');
  const [newPart, setNewPart] = useState<PartType>('소프라노');
  const [customPart, setCustomPart] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const members = sheetsService.getMembers().filter((m) => m.status === 'ACTIVE');

  const filteredMembers = selectedPartFilter === '전체'
    ? members
    : members.filter((m) => m.part === selectedPartFilter);

  const handleSelectMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedMember) {
      setErrorMsg('단원을 먼저 선택해 주세요.');
      return;
    }

    if (phoneInput.trim() !== selectedMember.phoneLast4) {
      setErrorMsg('전화번호 뒷자리 4자리가 일치하지 않습니다.');
      return;
    }

    const profile = bindDeviceProfile(
      selectedMember.id,
      selectedMember.name,
      selectedMember.part,
      selectedMember.phoneLast4
    );
    onSuccess(profile);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('이름을 입력해 주세요.');
      return;
    }

    if (!/^\d{4}$/.test(newPhone.trim())) {
      setErrorMsg('전화번호 뒷자리는 숫자 4자리여야 합니다.');
      return;
    }

    const finalPart: PartType = newPart === '기타' ? customPart.trim() || '기타' : newPart;

    const newMember: Member = {
      id: `mem_new_${Date.now()}`,
      name: trimmedName,
      part: finalPart,
      phoneLast4: newPhone.trim(),
      role: finalPart === '선생님' ? 'ADMIN' : finalPart === '객원' ? 'GUEST' : 'MEMBER',
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    await sheetsService.addMember(newMember);

    const profile = bindDeviceProfile(
      newMember.id,
      newMember.name,
      newMember.part,
      newMember.phoneLast4
    );

    onSuccess(profile);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <img
            src="/moonchoir-logo.png"
            alt="Moonchoir"
            style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 10px', display: 'block', objectFit: 'cover' }}
          />
          <div className="modal-badge">1회 본인 기기 등록</div>
          <h2 className="modal-title">본인 확인 & 기기 연결</h2>
          <p className="modal-desc">
            한 번만 등록해 두면, 앞으로 연습실 종이 QR을 비출 때마다 대리 출석 걱정 없이 1초 만에 바로 출석됩니다!
          </p>
        </div>

        <div className="tab-pill-group">
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

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        {tab === 'SELECT' ? (
          <div>
            {!selectedMember ? (
              <>
                <div className="filter-scroll-row">
                  {['전체', '소프라노', '알토', '테너', '베이스'].map((p) => (
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

                <div className="member-picker-list">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="member-picker-item"
                      onClick={() => { setSelectedMember(m); setErrorMsg(''); }}
                    >
                      <span className={`part-badge part-${m.part}`}>{m.part}</span>
                      <span className="member-picker-name">{m.name}</span>
                      <span className="member-picker-arrow">선택 ➔</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={handleSelectMemberSubmit} className="form-stack">
                <div className="selected-card">
                  <span className={`part-badge part-${selectedMember.part}`}>{selectedMember.part}</span>
                  <span className="selected-name">{selectedMember.name} 님</span>
                  <button
                    type="button"
                    className="btn-change"
                    onClick={() => { setSelectedMember(null); setPhoneInput(''); }}
                  >
                    변경
                  </button>
                </div>

                <label className="form-label" htmlFor="phone-last4">
                  전화번호 뒷자리 4자리 입력 (본인 확인용)
                </label>
                <input
                  id="phone-last4"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="input-text"
                  placeholder="예: 1234"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  autoFocus
                />

                <button type="submit" className="btn-primary-large">
                  내 폰으로 등록 완료
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="form-stack">
            <label className="form-label" htmlFor="reg-name">이름 (실명)</label>
            <input
              id="reg-name"
              type="text"
              className="input-text"
              placeholder="예: 홍길동"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />

            <label className="form-label">파트 구분</label>
            <div className="part-radio-grid">
              {DEFAULT_PARTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`part-radio-btn ${newPart === p ? 'active' : ''}`}
                  onClick={() => setNewPart(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className={`part-radio-btn ${newPart === '기타' ? 'active' : ''}`}
                onClick={() => setNewPart('기타')}
              >
                기타 (직접입력)
              </button>
            </div>

            {newPart === '기타' && (
              <input
                type="text"
                className="input-text"
                placeholder="파트명 입력 (예: 카운터테너, 피아노)"
                value={customPart}
                onChange={(e) => setCustomPart(e.target.value)}
                autoFocus
              />
            )}

            <label className="form-label" htmlFor="reg-phone">전화번호 뒷자리 4자리 (기기 식별용)</label>
            <input
              id="reg-phone"
              type="password"
              inputMode="numeric"
              maxLength={4}
              className="input-text"
              placeholder="예: 5678"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              required
            />

            <button type="submit" className="btn-primary-large">
              신규 등록하고 내 폰으로 바인딩
            </button>
          </form>
        )}

        {onClose && (
          <button type="button" className="btn-secondary-cancel" onClick={onClose}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
};
