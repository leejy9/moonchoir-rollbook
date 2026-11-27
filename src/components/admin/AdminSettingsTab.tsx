import React, { useState } from 'react';
import { sheetsService } from '../../services/sheets';
import type { AppConfig, LocationPreset } from '../../types/rollbook';
import { LocationPickerMap } from '../LocationPickerMap';
import { PracticeSettingsSection } from './settings/PracticeSettingsSection';

export interface AdminSettingsTabProps {
  config: AppConfig;
  locationPresets: LocationPreset[];
  dynamicParts: string[];
  dynamicMemberStatuses: string[];
  dynamicCategories: string[];
  onDataChanged: () => void;
}

type TaxonomyGroup = 'PARTS' | 'STATUSES' | 'CATEGORIES';

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({
  config,
  locationPresets,
  dynamicParts,
  dynamicMemberStatuses,
  dynamicCategories,
  onDataChanged,
}) => {
  const [settingsSubTab, setSettingsSubTab] = useState<'LOCATIONS' | 'TAXONOMY' | 'PRACTICE'>('LOCATIONS');

  // Location search and drawer
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [isLocationDrawerOpen, setIsLocationDrawerOpen] = useState(false);
  const [presetSuccessMsg, setPresetSuccessMsg] = useState<string | null>(null);

  // Form state
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [presetFormName, setPresetFormName] = useState('');
  const [presetFormAddress, setPresetFormAddress] = useState('');
  const [presetFormDetailAddress, setPresetFormDetailAddress] = useState('');
  const [presetFormEntranceNote, setPresetFormEntranceNote] = useState('');
  const [presetFormLat, setPresetFormLat] = useState<number>(37.5665);
  const [presetFormLon, setPresetFormLon] = useState<number>(126.978);
  const [presetCoordinatesConfirmed, setPresetCoordinatesConfirmed] = useState(false);
  const [presetFormRadius, setPresetFormRadius] = useState<number>(100);
  const [presetFormIsDefault, setPresetFormIsDefault] = useState<boolean>(false);
  const [locationToDelete, setLocationToDelete] = useState<LocationPreset | null>(null);

  // Taxonomy state
  const [selectedTaxonomyGroup, setSelectedTaxonomyGroup] = useState<TaxonomyGroup | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [taxSuccessMsg, setTaxSuccessMsg] = useState<string | null>(null);

  // Reset location form
  const resetLocationForm = () => {
    setEditingLocationId(null);
    setPresetFormName('');
    setPresetFormAddress('');
    setPresetFormDetailAddress('');
    setPresetFormEntranceNote('');
    setPresetFormLat(37.5665);
    setPresetFormLon(126.978);
    setPresetCoordinatesConfirmed(false);
    setPresetFormRadius(100);
    setPresetFormIsDefault(false);
  };

  const handleOpenCreateLocation = () => {
    resetLocationForm();
    setIsLocationDrawerOpen(true);
  };

  const handleStartEditLocation = (loc: LocationPreset) => {
    setEditingLocationId(loc.id);
    setPresetFormName(loc.name);
    setPresetFormAddress(loc.address || '');
    setPresetFormDetailAddress(loc.detailAddress || '');
    setPresetFormEntranceNote(loc.entranceNote || '');
    setPresetFormLat(loc.latitude);
    setPresetFormLon(loc.longitude);
    setPresetCoordinatesConfirmed(true);
    setPresetFormRadius(loc.radiusMeters || 100);
    setPresetFormIsDefault(loc.isDefault || false);
    setIsLocationDrawerOpen(true);
  };

  const handleCloseLocationDrawer = () => {
    setIsLocationDrawerOpen(false);
    resetLocationForm();
  };

  const handleSaveLocationPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = presetFormName.trim();
    if (!trimmedName) {
      alert('장소 명칭을 입력해주세요.');
      return;
    }

    const isDefaultCoords = Math.abs(presetFormLat - 37.5665) < 0.0001 && Math.abs(presetFormLon - 126.978) < 0.0001;
    if (presetFormAddress.trim() && !presetCoordinatesConfirmed) {
      alert('선택한 주소의 좌표를 확인하지 못했습니다. 지도에서 위치를 지정해주세요.');
      return;
    }
    if (presetFormAddress.trim() && isDefaultCoords && !presetFormAddress.includes('명동')) {
      alert('지도 검색 또는 현재 위치 설정을 통해 실제 좌표를 지정해주세요.');
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
      setPresetSuccessMsg(`'${trimmedName}' 장소 정보가 수정되었습니다`);
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
      setPresetSuccessMsg(`'${trimmedName}' 장소가 새로 등록되었습니다`);
    }

    handleCloseLocationDrawer();
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3000);
  };

  const handleConfirmDeleteLocation = async () => {
    if (!locationToDelete) return;
    const targetName = locationToDelete.name;
    await sheetsService.deleteLocationPreset(locationToDelete.id);
    if (editingLocationId === locationToDelete.id) {
      handleCloseLocationDrawer();
    }
    setLocationToDelete(null);
    setPresetSuccessMsg(`'${targetName}' 장소가 삭제되었습니다`);
    onDataChanged();
    setTimeout(() => setPresetSuccessMsg(null), 3000);
  };

  // Taxonomy handlers
  const handleAddTaxonomyTag = () => {
    const val = newTagInput.trim();
    if (!val || !selectedTaxonomyGroup) return;

    if (selectedTaxonomyGroup === 'PARTS') {
      sheetsService.addPart(val);
      setTaxSuccessMsg(`파트 '${val}' 항목이 추가되었습니다`);
    } else if (selectedTaxonomyGroup === 'STATUSES') {
      sheetsService.addMemberStatus(val);
      setTaxSuccessMsg(`단원 구분 '${val}' 항목이 추가되었습니다`);
    } else if (selectedTaxonomyGroup === 'CATEGORIES') {
      sheetsService.addCategory(val);
      setTaxSuccessMsg(`일정 구분 '${val}' 항목이 추가되었습니다`);
    }

    setNewTagInput('');
    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const handleRemoveTaxonomyTag = (tag: string) => {
    if (!selectedTaxonomyGroup) return;

    if (selectedTaxonomyGroup === 'PARTS') {
      if (sheetsService.getParts().length <= 1) {
        alert('최소 1개 이상의 파트가 유지되어야 합니다.');
        return;
      }
      sheetsService.removePart(tag);
      setTaxSuccessMsg(`파트 '${tag}' 항목이 삭제되었습니다`);
    } else if (selectedTaxonomyGroup === 'STATUSES') {
      if (sheetsService.getMemberStatuses().length <= 1) {
        alert('최소 1개 이상의 구분이 유지되어야 합니다.');
        return;
      }
      sheetsService.removeMemberStatus(tag);
      setTaxSuccessMsg(`단원 구분 '${tag}' 항목이 삭제되었습니다`);
    } else if (selectedTaxonomyGroup === 'CATEGORIES') {
      if (sheetsService.getCategories().length <= 1) {
        alert('최소 1개 이상의 일정이 유지되어야 합니다.');
        return;
      }
      sheetsService.removeCategory(tag);
      setTaxSuccessMsg(`일정 구분 '${tag}' 항목이 삭제되었습니다`);
    }

    onDataChanged();
    setTimeout(() => setTaxSuccessMsg(null), 3000);
  };

  const filteredLocations = locationPresets.filter((loc) => {
    if (!locationSearchQuery.trim()) return true;
    const query = locationSearchQuery.toLowerCase();
    return (
      loc.name.toLowerCase().includes(query) ||
      (loc.address && loc.address.toLowerCase().includes(query)) ||
      (loc.detailAddress && loc.detailAddress.toLowerCase().includes(query))
    );
  });

  return (
    <div className="admin-tab-body admin-settings-layout">
      {/* Sub-segment Pill Bar */}
      <div className="subsegment-pill-bar admin-settings-nav" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
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
        <button
          type="button"
          className={`subsegment-pill ${settingsSubTab === 'PRACTICE' ? 'active' : ''}`}
          onClick={() => setSettingsSubTab('PRACTICE')}
        >
          연습곡 설정
        </button>
      </div>

      {presetSuccessMsg && (
        <div className="success-banner" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px' }}>
          {presetSuccessMsg}
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBTAB 1: 장소 관리 (GALLERY VIEW & SLIDE DRAWER)             */}
      {/* ============================================================== */}
      {settingsSubTab === 'LOCATIONS' && (
        <div>
          {/* Action Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 className="section-title" style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>
                {`등록 장소 (${locationPresets.length}곳)`}
              </h2>
              <input
                type="text"
                placeholder="장소명, 주소 검색"
                value={locationSearchQuery}
                onChange={(e) => setLocationSearchQuery(e.target.value)}
                className="input-text"
                style={{ width: '200px', height: '36px', fontSize: '13px' }}
              />
            </div>
            <button
              type="button"
              className="btn-primary-large"
              onClick={handleOpenCreateLocation}
              style={{
                width: 'auto',
                minHeight: '38px',
                padding: '0 16px',
                fontSize: '13px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '8px',
              }}
            >
              새 장소 등록
            </button>
          </div>

          {/* Notion Gallery Grid */}
          {filteredLocations.length === 0 ? (
            <div className="toss-section-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#334155', margin: '0 0 4px 0' }}>
                {locationSearchQuery ? '검색 결과와 일치하는 장소가 없습니다' : '등록된 장소가 없습니다.'}
              </p>
              <p style={{ fontSize: '13px', margin: '0 0 16px 0', color: '#64748b' }}>
                새로운 합창 연습실이나 공연장을 등록할 수 있습니다
              </p>
              <button
                type="button"
                className="btn-sync"
                onClick={handleOpenCreateLocation}
                style={{ width: 'auto', margin: '0 auto', padding: '0 16px', height: '36px', fontSize: '13px' }}
              >
                새 장소 등록
              </button>
            </div>
          ) : (
            <div className="notion-gallery-grid">
              {filteredLocations.map((loc) => {
                const isSelected = editingLocationId === loc.id;
                return (
                  <div
                    key={loc.id}
                    className={`notion-gallery-card ${isSelected ? 'is-active-card' : ''}`}
                  >
                    {/* Cover Bar: Quiet Neutral Ramp */}
                    <div className="notion-gallery-card-cover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                          장소 정보
                        </span>
                        {loc.isDefault && (
                          <span
                            className="part-badge"
                            style={{ backgroundColor: '#282C48', color: '#ffffff', fontSize: '11px', padding: '2px 7px', borderRadius: '4px' }}
                          >
                            기본 연습실
                          </span>
                        )}
                      </div>
                      <span
                        className="status-pill"
                        style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: '11.5px', borderRadius: '4px' }}
                      >
                        {`반경 ${loc.radiusMeters}m`}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="notion-gallery-card-body">
                      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                        {loc.name}
                      </h3>
                      <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '11.5px', flexShrink: 0, marginTop: '2px' }}>주소</span>
                        <span style={{ wordBreak: 'break-all', lineHeight: 1.45 }}>{loc.address || '주소 정보 없음'}</span>
                      </div>
                      {loc.detailAddress && (
                        <div style={{ fontSize: '12.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '11.5px', flexShrink: 0 }}>상세</span>
                          <span>{loc.detailAddress}</span>
                        </div>
                      )}
                      {loc.entranceNote && (
                        <div style={{ fontSize: '12px', color: '#047857', background: '#f0fdf4', padding: '4px 8px', borderRadius: '6px', marginTop: '2px', lineHeight: 1.4 }}>
                          안내: {loc.entranceNote}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="notion-gallery-card-footer">
                      <button
                        type="button"
                        className="btn-qr-action-secondary"
                        onClick={() => handleStartEditLocation(loc)}
                        style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px', borderRadius: '6px' }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="btn-qr-action-secondary"
                        onClick={() => setLocationToDelete(loc)}
                        style={{
                          minHeight: '32px',
                          padding: '0 12px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          color: '#dc2626',
                          borderColor: '#fca5a5',
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

      {/* ============================================================== */}
      {/* SUBTAB 2: 태그 관리 (META CARDS & DRAWER)                      */}
      {/* ============================================================== */}
      {settingsSubTab === 'TAXONOMY' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h2 className="section-title" style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>
              분류 체계 관리
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              카드를 선택하여 파트, 단원 구분, 일정 구분을 자유롭게 추가하고 조회할 수 있습니다
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {/* Meta Card 1: PARTS */}
            <div
              className="taxonomy-meta-card"
              onClick={() => setSelectedTaxonomyGroup('PARTS')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>파트 구성</span>
                <span className="status-pill" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, borderRadius: '4px' }}>
                  {dynamicParts.length}개 항목
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 2px 0' }}>
                  파트 관리
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  합창 파트 구성 (소프라노, 알토, 테너, 베이스, 객원 등)
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {dynamicParts.slice(0, 5).map((part) => (
                  <span key={part} className="part-badge" style={{ backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '4px' }}>
                    {part}
                  </span>
                ))}
                {dynamicParts.length > 5 && (
                  <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center' }}>
                    +{dynamicParts.length - 5}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '12.5px', color: '#282C48', fontWeight: 500 }}>
                파트 조회 및 편집 →
              </div>
            </div>

            {/* Meta Card 2: STATUSES */}
            <div
              className="taxonomy-meta-card"
              onClick={() => setSelectedTaxonomyGroup('STATUSES')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>단원 상태</span>
                <span className="status-pill" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, borderRadius: '4px' }}>
                  {dynamicMemberStatuses.length}개 구분
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 2px 0' }}>
                  단원 구분 및 상태
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  단원 자격 및 직책 상태 (정단원, 수습단원, 휴원 등)
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {dynamicMemberStatuses.slice(0, 5).map((status) => (
                  <span key={status} className="part-badge" style={{ backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '4px' }}>
                    {status}
                  </span>
                ))}
                {dynamicMemberStatuses.length > 5 && (
                  <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center' }}>
                    +{dynamicMemberStatuses.length - 5}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '12.5px', color: '#282C48', fontWeight: 500 }}>
                단원 구분 조회 및 편집 →
              </div>
            </div>

            {/* Meta Card 3: CATEGORIES */}
            <div
              className="taxonomy-meta-card"
              onClick={() => setSelectedTaxonomyGroup('CATEGORIES')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>일정 범주</span>
                <span className="status-pill" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, borderRadius: '4px' }}>
                  {dynamicCategories.length}개 일정
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 2px 0' }}>
                  일정 구분
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  연습 및 공연 범주 (정기연습, 추가연습, 메인연주 등)
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {dynamicCategories.slice(0, 5).map((cat) => (
                  <span key={cat} className="part-badge" style={{ backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '4px' }}>
                    {cat}
                  </span>
                ))}
                {dynamicCategories.length > 5 && (
                  <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center' }}>
                    +{dynamicCategories.length - 5}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '12.5px', color: '#282C48', fontWeight: 500 }}>
                일정 구분 조회 및 편집 →
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUBTAB 3: 연습곡 설정 (V3-16)                                  */}
      {/* ============================================================== */}
      {settingsSubTab === 'PRACTICE' && (
        <PracticeSettingsSection
          config={config}
          allCategories={dynamicCategories}
          onDataChanged={onDataChanged}
        />
      )}

      {/* ============================================================== */}
      {/* SLIDE-OVER DRAWER: LOCATION FORM (ADD / EDIT)                  */}
      {/* ============================================================== */}
      {isLocationDrawerOpen && (
        <div className="drawer-backdrop" onClick={handleCloseLocationDrawer}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="drawer-header">
              <div className="drawer-title-wrap">
                <h3 className="drawer-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {editingLocationId ? `장소 정보 수정 (${presetFormName})` : '새 장소 등록'}
                </h3>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={handleCloseLocationDrawer}
                title="닫기"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            {/* Drawer Body (Form) */}
            <form id="location-drawer-form" onSubmit={handleSaveLocationPreset} className="drawer-body">
              <div>
                <label className="form-label" htmlFor="drawer-loc-name">
                  장소 명칭 <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  id="drawer-loc-name"
                  type="text"
                  className="input-text"
                  placeholder="예: 문콰이어 메인 연습실, 삼익아트홀"
                  value={presetFormName}
                  onChange={(e) => setPresetFormName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <input
                  id="drawer-loc-default"
                  type="checkbox"
                  checked={presetFormIsDefault}
                  onChange={(e) => setPresetFormIsDefault(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#282C48', cursor: 'pointer' }}
                />
                <label htmlFor="drawer-loc-default" style={{ fontSize: '13px', fontWeight: 500, color: '#334155', cursor: 'pointer' }}>
                  이 장소를 기본 연습실로 설정
                </label>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    인정 반경: <span style={{ fontWeight: 600, color: '#282C48' }}>{presetFormRadius}m</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  {[50, 100, 200, 300].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`subsegment-pill ${presetFormRadius === r ? 'active' : ''}`}
                      onClick={() => setPresetFormRadius(r)}
                      style={{ flex: 1, padding: '6px 0', fontSize: '12px' }}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={30}
                  max={500}
                  step={10}
                  value={presetFormRadius}
                  onChange={(e) => setPresetFormRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#282C48' }}
                />
              </div>

              {/* Map & Address Selector */}
              <div>
                <label className="form-label">
                  주소 및 위치 확인 <span style={{ color: '#dc2626' }}>*</span>
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
                    setPresetCoordinatesConfirmed(true);
                    if (addr) setPresetFormAddress(addr);
                  }}
                  onAddressSelected={(addr) => {
                    setPresetFormAddress(addr);
                    setPresetCoordinatesConfirmed(true);
                  }}
                  onPlaceNameSelected={(pName) => {
                    if (!presetFormName) setPresetFormName(pName);
                  }}
                  onChangeDetailAddress={setPresetFormDetailAddress}
                  onChangeEntranceNote={setPresetFormEntranceNote}
                  onChangeRadius={setPresetFormRadius}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="drawer-loc-detail">
                  상세 주소
                </label>
                <input
                  id="drawer-loc-detail"
                  type="text"
                  className="input-text"
                  placeholder="예: 3층 대연습실, 지하 1층 B홀"
                  value={presetFormDetailAddress}
                  onChange={(e) => setPresetFormDetailAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="drawer-loc-note">
                  출입구 및 안내 메모
                </label>
                <input
                  id="drawer-loc-note"
                  type="text"
                  className="input-text"
                  placeholder="예: 후문 주차장 엘리베이터 이용"
                  value={presetFormEntranceNote}
                  onChange={(e) => setPresetFormEntranceNote(e.target.value)}
                />
              </div>
            </form>

            {/* Drawer Footer */}
            <div className="drawer-footer">
              <button
                type="button"
                className="btn-secondary-cancel"
                onClick={handleCloseLocationDrawer}
                style={{ flex: 1, minHeight: '40px', borderRadius: '8px' }}
              >
                취소
              </button>
              <button
                type="submit"
                form="location-drawer-form"
                className="btn-primary-large"
                style={{ flex: 2, minHeight: '40px', borderRadius: '8px', fontWeight: 500 }}
              >
                {editingLocationId ? '수정 내용 저장' : '장소 등록 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SLIDE-OVER DRAWER: TAXONOMY DETAIL & ADD/REMOVE                */}
      {/* ============================================================== */}
      {selectedTaxonomyGroup && (
        <div className="drawer-backdrop" onClick={() => setSelectedTaxonomyGroup(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-wrap">
                <h3 className="drawer-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {selectedTaxonomyGroup === 'PARTS' && '파트 구성 관리'}
                  {selectedTaxonomyGroup === 'STATUSES' && '단원 구분 및 상태 관리'}
                  {selectedTaxonomyGroup === 'CATEGORIES' && '일정 구분 관리'}
                </h3>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedTaxonomyGroup(null)}
                title="닫기"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="drawer-body">
              {taxSuccessMsg && (
                <div className="success-banner" style={{ padding: '10px 14px', borderRadius: '8px' }}>
                  {taxSuccessMsg}
                </div>
              )}

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569', lineHeight: 1.5, border: '1px solid #e2e8f0' }}>
                새로운 분류 항목을 추가하거나 삭제할 수 있으며, 기존에 작성된 데이터는 안전하게 보존됩니다. (최소 1개 항목 유지)
              </div>

              {/* Tag Add Input Row */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder={
                    selectedTaxonomyGroup === 'PARTS'
                      ? '새 파트명 입력 (예: 카운터테너)'
                      : selectedTaxonomyGroup === 'STATUSES'
                        ? '새 구분명 입력 (예: 명예단원)'
                        : '새 일정구분 입력 (예: 워크숍)'
                  }
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTaxonomyTag())}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-sync"
                  onClick={handleAddTaxonomyTag}
                  style={{ width: 'auto', padding: '0 16px', fontWeight: 500, borderRadius: '8px' }}
                >
                  추가
                </button>
              </div>

              {/* Chips List */}
              <div>
                <h4 style={{ fontSize: '13.5px', fontWeight: 600, color: '#334155', margin: '0 0 8px 0' }}>
                  등록된 항목
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(selectedTaxonomyGroup === 'PARTS'
                    ? dynamicParts
                    : selectedTaxonomyGroup === 'STATUSES'
                      ? dynamicMemberStatuses
                      : dynamicCategories
                  ).map((item) => (
                    <span
                      key={item}
                      className="removable-tag-chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: '#f1f5f9',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#1e293b',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTaxonomyTag(item)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '0 2px',
                          lineHeight: 1,
                        }}
                        title={`'${item}' 삭제`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="btn-primary-large"
                onClick={() => setSelectedTaxonomyGroup(null)}
                style={{ width: '100%', minHeight: '40px', borderRadius: '8px', fontWeight: 500 }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: Delete Location Confirmation                            */}
      {/* ============================================================== */}
      {locationToDelete && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '400px', borderRadius: '12px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ fontSize: '17px', fontWeight: 600, margin: '4px 0 0 0' }}>
                '{locationToDelete.name}' 장소를 삭제할까요?
              </h2>
              <p className="modal-desc" style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
                삭제 시 장소 목록에서 제거되며, 이 장소를 사용 중인 기존 일정의 좌표는 유지됩니다.
              </p>
            </div>

            <div className="modal-button-group" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary-large"
                style={{ backgroundColor: '#dc2626', minHeight: '40px', borderRadius: '8px', fontWeight: 500 }}
                onClick={handleConfirmDeleteLocation}
              >
                삭제하기
              </button>
              <button
                type="button"
                className="btn-secondary-cancel"
                style={{ minHeight: '40px', borderRadius: '8px' }}
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
