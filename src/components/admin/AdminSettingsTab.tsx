import React, { useState } from 'react';
import { sheetsService } from '../../services/sheets';
import type { AppConfig, LocationPreset } from '../../types/rollbook';
import { IconCalendar, IconSync, IconTag, IconUsers } from '../Icons';
import { LocationPickerMap } from '../LocationPickerMap';

export interface AdminSettingsTabProps {
  config: AppConfig;
  locationPresets: LocationPreset[];
  dynamicParts: string[];
  dynamicMemberStatuses: string[];
  dynamicCategories: string[];
  onDataChanged: () => void;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({
  config,
  locationPresets,
  dynamicParts,
  dynamicMemberStatuses,
  dynamicCategories,
  onDataChanged,
}) => {
  const [settingsSubTab, setSettingsSubTab] = useState<'SHEETS' | 'LOCATIONS' | 'TAXONOMY'>('SHEETS');

  // --- 1. Settings State (Google Sheets Sync) ---
  const [sheetsUrl, setSheetsUrl] = useState(config.sheetsWebAppUrl || '');
  const [lateGrace, setLateGrace] = useState(config.lateGraceMinutes || 10);
  const [adminPinInput, setAdminPinInput] = useState(config.adminPin || '1234');
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // --- 2. Location Presets Tab State ---
  const [presetFormName, setPresetFormName] = useState('');
  const [presetFormAddress, setPresetFormAddress] = useState('');
  const [presetFormDetailAddress, setPresetFormDetailAddress] = useState('');
  const [presetFormEntranceNote, setPresetFormEntranceNote] = useState('');
  const [presetFormLat, setPresetFormLat] = useState<number>(37.5665);
  const [presetFormLon, setPresetFormLon] = useState<number>(126.978);
  const [presetFormRadius, setPresetFormRadius] = useState<number>(100);
  const [presetFormIsDefault, setPresetFormIsDefault] = useState<boolean>(false);
  const [presetSuccessMsg, setPresetSuccessMsg] = useState<string | null>(null);

  // Edit & Delete Modal States for Locations
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<LocationPreset | null>(null);

  // --- 3. Taxonomy Dynamic Settings State ---
  const [newPartInput, setNewPartInput] = useState('');
  const [newStatusInput, setNewStatusInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [_taxSuccessMsg, setTaxSuccessMsg] = useState<string | null>(null);

  // ================= HANDLERS =================
  const resetLocationForm = () => {
    setEditingLocationId(null);
    setPresetFormName('');
    setPresetFormAddress('');
    setPresetFormDetailAddress('');
    setPresetFormEntranceNote('');
    setPresetFormLat(37.5665);
    setPresetFormLon(126.978);
    setPresetFormRadius(100);
    setPresetFormIsDefault(false);
  };

  const handleStartEditLocation = (loc: LocationPreset) => {
    setEditingLocationId(loc.id);
    setPresetFormName(loc.name);
    setPresetFormAddress(loc.address || '');
    setPresetFormDetailAddress(loc.detailAddress || '');
    setPresetFormEntranceNote(loc.entranceNote || '');
    setPresetFormLat(loc.latitude);
    setPresetFormLon(loc.longitude);
    setPresetFormRadius(loc.radiusMeters || 100);
    setPresetFormIsDefault(loc.isDefault || false);

    const formEl = document.getElementById('location-preset-form-card');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveLocationPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = presetFormName.trim();
    if (!trimmedName) {
      alert('장소 명칭을 입력해주세요.');
      return;
    }

    const isDefaultCoords = Math.abs(presetFormLat - 37.5665) < 0.0001 && Math.abs(presetFormLon - 126.978) < 0.0001;
    if (presetFormAddress.trim() && isDefaultCoords && !presetFormAddress.includes('명동')) {
      alert(
        '📍 지도 검색 또는 현재 위치 설정을 통해 실제 좌표를 지정해주세요.\n(기본 서울 명동 좌표로 잘못 저장되지 않도록 보호합니다.)'
      );
      return;
    }

    if (editingLocationId) {
      await sheetsService.updateLocationPreset(editingLocationId, {
        name: trimmedName,
        address: presetFormAddress.trim(),
        detailAddress: presetFormDetailAddress.trim(),
        entranceNote: presetFormEntranceNote.trim(),
        latitude: presetFormLat,
        longitude: presetFormLon,
        radiusMeters: presetFormRadius,
        isDefault: presetFormIsDefault,
      });
      setPresetSuccessMsg(`'${trimmedName}' 장소 정보가 성공적으로 수정되었습니다.`);
    } else {
      const newPreset: LocationPreset = {
        id: `loc_${Date.now()}`,
        name: trimmedName,
        address: presetFormAddress.trim(),
        detailAddress: presetFormDetailAddress.trim(),
        entranceNote: presetFormEntranceNote.trim(),
        latitude: presetFormLat,
        longitude: presetFormLon,
        radiusMeters: presetFormRadius,
        isDefault: presetFormIsDefault,
      };
      await sheetsService.addLocationPreset(newPreset);
      setPresetSuccessMsg(`'${trimmedName}' 연습실이 새로 등록되었습니다.`);
    }

    resetLocationForm();
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3500);
  };

  const handleConfirmDeleteLocation = async () => {
    if (!locationToDelete) return;
    const targetName = locationToDelete.name;
    await sheetsService.deleteLocationPreset(locationToDelete.id);
    if (editingLocationId === locationToDelete.id) {
      resetLocationForm();
    }
    setLocationToDelete(null);
    setPresetSuccessMsg(`'${targetName}' 장소가 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3000);
  };

  // Taxonomy Handlers
  const handleAddPart = () => {
    const val = newPartInput.trim();
    if (!val) return;
    sheetsService.addPart(val);
    setTaxSuccessMsg(`파트 '${val}'이(가) 추가되었습니다.`);
    setNewPartInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemovePart = (part: string) => {
    if (sheetsService.getParts().length <= 1) {
      alert('최소 1개 이상의 파트가 유지되어야 합니다.');
      return;
    }
    sheetsService.removePart(part);
    setTaxSuccessMsg(`파트 '${part}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleAddMemberStatus = () => {
    const val = newStatusInput.trim();
    if (!val) return;
    sheetsService.addMemberStatus(val);
    setTaxSuccessMsg(`회원 상태 '${val}'이(가) 추가되었습니다.`);
    setNewStatusInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemoveMemberStatus = (st: string) => {
    if (sheetsService.getMemberStatuses().length <= 1) {
      alert('최소 1개 이상의 회원 구분이 유지되어야 합니다.');
      return;
    }
    sheetsService.removeMemberStatus(st);
    setTaxSuccessMsg(`회원 상태 '${st}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleAddCategory = () => {
    const val = newCategoryInput.trim();
    if (!val) return;
    sheetsService.addCategory(val);
    setTaxSuccessMsg(`일정 카테고리 '${val}'이(가) 추가되었습니다.`);
    setNewCategoryInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemoveCategory = (cat: string) => {
    if (sheetsService.getCategories().length <= 1) {
      alert('최소 1개 이상의 일정이 유지되어야 합니다.');
      return;
    }
    sheetsService.removeCategory(cat);
    setTaxSuccessMsg(`일정 카테고리 '${cat}'이(가) 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    try {
      await sheetsService.updateConfig({
        sheetsWebAppUrl: sheetsUrl.trim(),
        lateGraceMinutes: Number(lateGrace),
        adminPin: adminPinInput.trim(),
      });
      setSettingsSuccessMsg('어드민 설정이 성공적으로 저장되었습니다 (구글 시트 동기화 완료)!');
      onDataChanged();
      setTimeout(() => setSettingsSuccessMsg(''), 3000);
    } catch (err: unknown) {
      console.error('[AdminSettingsTab] Failed to save settings:', err);
      setSettingsSuccessMsg('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncRemote = async () => {
    if (!sheetsUrl.trim()) {
      setSyncStatusMsg({ type: 'error', text: 'Google Apps Script Web App URL을 입력해주세요.' });
      return;
    }
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const res = await sheetsService.fetchRemoteData(sheetsUrl.trim());
      setSyncStatusMsg({
        type: 'success',
        text: `동기화 성공! 대원 ${res.count?.members ?? 0}명, 일정 ${res.count?.schedules ?? 0}건, 원천 로그 ${res.count?.logs ?? 0}건 수신`,
      });
      onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatusMsg({ type: 'error', text: `구글 시트 동기화 실패: ${msg}` });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="admin-tab-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub-segment Pill Bar */}
      <div className="subsegment-pill-bar">
        <button
          type="button"
          className={`subsegment-pill ${settingsSubTab === 'SHEETS' ? 'active' : ''}`}
          onClick={() => setSettingsSubTab('SHEETS')}
        >
          시트 연동
        </button>
        <button
          type="button"
          className={`subsegment-pill ${settingsSubTab === 'LOCATIONS' ? 'active' : ''}`}
          onClick={() => setSettingsSubTab('LOCATIONS')}
        >
          장소 관리
        </button>
        <button
          type="button"
          className={`subsegment-pill ${settingsSubTab === 'TAXONOMY' ? 'active' : ''}`}
          onClick={() => setSettingsSubTab('TAXONOMY')}
        >
          태그 관리
        </button>
      </div>

      {/* Sub-tab: LOCATIONS */}
      {settingsSubTab === 'LOCATIONS' && (
        <div className="admin-form-card">
          <div className="section-title-row">
            <h2 className="section-title">장소 관리</h2>
          </div>

          {presetSuccessMsg && (
            <div className="success-banner" style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px' }}>
              ✅ {presetSuccessMsg}
            </div>
          )}

          {/* Registered Locations List */}
          <div style={{ marginTop: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#191f28' }}>
                등록된 장소 목록 ({locationPresets.length}곳)
              </h3>
              {editingLocationId && (
                <button
                  type="button"
                  onClick={resetLocationForm}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#5B3E96',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ➕ 새 장소 등록하기
                </button>
              )}
            </div>

            {locationPresets.length === 0 ? (
              <p className="empty-hint">등록된 연습실 장소가 없습니다. 아래에서 추가해주세요.</p>
            ) : (
              locationPresets.map((loc) => (
                <div
                  key={loc.id}
                  className={`location-item-card ${loc.isDefault ? 'is-default' : ''}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '14px 16px',
                    background: editingLocationId === loc.id ? '#F8F5FE' : '#FFFFFF',
                    borderRadius: '12px',
                    border:
                      editingLocationId === loc.id
                        ? '2px solid #5B3E96'
                        : loc.isDefault
                          ? '1.5px solid #5B3E96'
                          : '1px solid #E2E8F0',
                    marginBottom: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#191f28' }}>
                        {loc.name}
                      </span>
                      {loc.isDefault && (
                        <span className="part-badge" style={{ backgroundColor: '#5B3E96', color: '#fff' }}>
                          기본 연습실
                        </span>
                      )}
                      <span
                        className="status-pill"
                        style={{ backgroundColor: '#F3E8FF', color: '#5B3E96', fontWeight: 600 }}
                      >
                        반경 {loc.radiusMeters}m
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#4e5968', marginTop: '6px' }}>
                      📍 {loc.address || '주소 정보 없음'}
                    </div>
                    {loc.detailAddress && (
                      <div style={{ fontSize: '12.5px', color: '#6B7280', marginTop: '2px' }}>
                        🏢 상세: {loc.detailAddress}
                      </div>
                    )}
                    {loc.entranceNote && (
                      <div style={{ fontSize: '12.5px', color: '#059669', marginTop: '2px' }}>
                        🚪 입구 안내: {loc.entranceNote}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn-qr-action-secondary"
                      onClick={() => handleStartEditLocation(loc)}
                      style={{ minHeight: '34px', padding: '0 12px', fontSize: '12.5px', borderRadius: '8px' }}
                    >
                      ✏️ 수정
                    </button>
                    <button
                      type="button"
                      className="btn-qr-action-secondary"
                      onClick={() => setLocationToDelete(loc)}
                      style={{
                        minHeight: '34px',
                        padding: '0 12px',
                        fontSize: '12.5px',
                        borderRadius: '8px',
                        color: '#EF4444',
                        borderColor: '#FCA5A5',
                      }}
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Location Add / Edit Form */}
          <div
            id="location-preset-form-card"
            className="toss-section-card"
            style={{
              border: editingLocationId ? '1.5px solid #5B3E96' : '1.5px dashed rgba(92, 83, 219, 0.3)',
              background: editingLocationId ? '#FBF9FF' : '#FAF9FF',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-primary)', margin: 0 }}>
                {editingLocationId ? `✏️ 장소 정보 수정 ('${presetFormName}')` : '➕ 새 연습실 / 공연장 등록'}
              </h3>
              {editingLocationId && (
                <button
                  type="button"
                  onClick={resetLocationForm}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#6B7280',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  새 등록으로 전환
                </button>
              )}
            </div>

            <form onSubmit={handleSaveLocationPreset} className="form-stack">
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>
                  장소 명칭 (필수)
                </label>
                <input
                  type="text"
                  className="modern-input"
                  placeholder="예: 문콰이어 연습실, 예술의전당 리허설룸"
                  value={presetFormName}
                  onChange={(e) => setPresetFormName(e.target.value)}
                  required
                />
              </div>

              {/* Modern Interactive Map with Daum Road Address Search & Radius */}
              <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                <label className="form-label" style={{ fontWeight: 700, marginBottom: '6px' }}>
                  🗺️ 장소 위치 및 출석 인정 반경 설정
                </label>
                <LocationPickerMap
                  lat={presetFormLat}
                  lon={presetFormLon}
                  radius={presetFormRadius}
                  address={presetFormAddress}
                  detailAddress={presetFormDetailAddress}
                  entranceNote={presetFormEntranceNote}
                  onChangeLocation={(lat, lon, addr) => {
                    setPresetFormLat(lat);
                    setPresetFormLon(lon);
                    if (addr) {
                      setPresetFormAddress(addr);
                      if (!presetFormName.trim()) {
                        setPresetFormName(addr.split(' ')[0] || addr);
                      }
                    }
                  }}
                  onChangeDetailAddress={(detail) => setPresetFormDetailAddress(detail)}
                  onChangeEntranceNote={(note) => setPresetFormEntranceNote(note)}
                  onChangeRadius={(r) => setPresetFormRadius(r)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="chk-default-loc"
                  checked={presetFormIsDefault}
                  onChange={(e) => setPresetFormIsDefault(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--brand-accent)', cursor: 'pointer' }}
                />
                <label htmlFor="chk-default-loc" style={{ fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}>
                  이 장소를 기본 연습실로 설정 (새 일정 생성 시 기본 선택)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="submit" className="btn-primary-large" style={{ minHeight: '44px' }}>
                  {editingLocationId ? '💾 장소 수정사항 저장' : '장소 등록 완료'}
                </button>
                {editingLocationId && (
                  <button
                    type="button"
                    className="btn-secondary-cancel"
                    onClick={resetLocationForm}
                    style={{ minHeight: '44px', padding: '0 20px' }}
                  >
                    수정 취소
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-tab: TAXONOMY */}
      {settingsSubTab === 'TAXONOMY' && (
        <div className="admin-form-card">
          <div className="section-title-row">
            <h2 className="section-title">태그 관리</h2>
          </div>

          <div className="toss-section-card" style={{ marginTop: '14px' }}>
            <div className="tag-manager-group">
              <div className="tag-manager-title">
                <IconTag size={16} color="var(--brand-accent)" />
                <span>파트</span>
              </div>
              <div className="tag-chips-wrap">
                {dynamicParts.map((part) => (
                  <span key={part} className="removable-tag-chip">
                    <span>{part}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemovePart(part)}
                      title={`'${part}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="파트 추가 (예: 바리톤, 반주자)"
                  value={newPartInput}
                  onChange={(e) => setNewPartInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPart())}
                />
                <button type="button" className="btn-sync" style={{ width: 'auto', padding: '0 16px' }} onClick={handleAddPart}>
                  추가
                </button>
              </div>
            </div>

            <div className="tag-manager-group">
              <div className="tag-manager-title">
                <IconUsers size={16} color="var(--brand-accent)" />
                <span>단원 구분</span>
              </div>
              <div className="tag-chips-wrap">
                {dynamicMemberStatuses.map((st) => (
                  <span key={st} className="removable-tag-chip">
                    <span>{st}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemoveMemberStatus(st)}
                      title={`'${st}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="구분 추가 (예: 명예단원)"
                  value={newStatusInput}
                  onChange={(e) => setNewStatusInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMemberStatus())}
                />
                <button type="button" className="btn-sync" style={{ width: 'auto', padding: '0 16px' }} onClick={handleAddMemberStatus}>
                  추가
                </button>
              </div>
            </div>

            <div className="tag-manager-group" style={{ marginBottom: 0 }}>
              <div className="tag-manager-title">
                <IconCalendar size={16} color="var(--brand-accent)" />
                <span>일정 구분</span>
              </div>
              <div className="tag-chips-wrap">
                {dynamicCategories.map((cat) => (
                  <span key={cat} className="removable-tag-chip">
                    <span>{cat}</span>
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => handleRemoveCategory(cat)}
                      title={`'${cat}' 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-add-row">
                <input
                  type="text"
                  className="input-text"
                  placeholder="일정 구분 추가 (예: 워크숍, 녹음)"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                />
                <button type="button" className="btn-sync" style={{ width: 'auto', padding: '0 16px' }} onClick={handleAddCategory}>
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab: SHEETS */}
      {settingsSubTab === 'SHEETS' && (
        <div className="admin-form-card">
          <h2 className="section-title">시트 연동</h2>

          {settingsSuccessMsg && <div className="success-banner">{settingsSuccessMsg}</div>}
          {syncStatusMsg && (
            <div className={syncStatusMsg.type === 'success' ? 'success-banner' : 'error-banner'}>
              {syncStatusMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="form-stack">
            <label className="form-label" htmlFor="sheets-url">
              Google Apps Script Web App URL
            </label>
            <input
              id="sheets-url"
              type="url"
              className="input-text"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={sheetsUrl}
              onChange={(e) => setSheetsUrl(e.target.value)}
            />

            <div className="settings-action-row">
              <button
                type="button"
                className="btn-sync"
                onClick={handleSyncRemote}
                disabled={isSyncing}
              >
                <IconSync size={16} className={isSyncing ? 'spin-icon' : ''} />
                <span>
                  {isSyncing ? '동기화 중...' : '시트 연결 및 데이터 수신'}
                </span>
              </button>
            </div>

            <div className="form-row-2">
              <div>
                <label className="form-label" htmlFor="late-grace">
                  지각 유예 (분)
                </label>
                <input
                  id="late-grace"
                  type="number"
                  min={0}
                  max={60}
                  className="input-text"
                  value={lateGrace}
                  onChange={(e) => setLateGrace(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="admin-pin-cfg">
                  관리자 PIN
                </label>
                <input
                  id="admin-pin-cfg"
                  type="password"
                  maxLength={8}
                  className="input-text"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary-large">
              저장
            </button>
          </form>

          {/* Location Presets View */}
          <div className="toss-section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">등록된 장소 ({locationPresets.length}곳)</h3>
            <div className="toss-member-list" style={{ marginTop: '8px' }}>
              {locationPresets.map((loc) => (
                <div key={loc.id} className="toss-member-item">
                  <div className="toss-member-left">
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#191f28' }}>
                      {loc.name} {loc.isDefault && <span className="part-badge">기본</span>}
                    </span>
                    <span className="meta-text" style={{ fontSize: '12px' }}>
                      {loc.address || '주소 미등록'} {loc.detailAddress ? `· ${loc.detailAddress}` : ''} ({loc.radiusMeters}m)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-qr-action-secondary"
                    onClick={() => setSettingsSubTab('LOCATIONS')}
                    style={{ fontSize: '12px', padding: '4px 10px', minHeight: '32px', flex: 'none' }}
                  >
                    관리
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: Delete Location Confirmation                            */}
      {/* ============================================================== */}
      {locationToDelete && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div
                className="modal-badge"
                style={{ color: '#EF4444', borderColor: '#FCA5A5', background: '#FEF2F2' }}
              >
                장소 삭제 확인
              </div>
              <h2 className="modal-title" style={{ fontSize: '18px', marginTop: '8px' }}>
                '{locationToDelete.name}' 장소를 삭제할까요?
              </h2>
              <p className="modal-desc" style={{ marginTop: '6px', fontSize: '13.5px', color: '#4E5968' }}>
                삭제 시 연습실 목록에서 제거되며, 이 장소를 사용 중인 기존 일정은 기본 좌표를 유지합니다. 계속
                진행하시겠습니까?
              </p>
            </div>

            <div className="modal-button-group" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary-large"
                style={{ backgroundColor: '#EF4444', minHeight: '44px' }}
                onClick={handleConfirmDeleteLocation}
              >
                삭제하기
              </button>
              <button
                type="button"
                className="btn-secondary-cancel"
                style={{ minHeight: '44px' }}
                onClick={() => setLocationToDelete(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
