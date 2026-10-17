import React, { useState } from 'react';
import type { LocationPreset } from '../types/rollbook';
import { LocationPickerMap } from './LocationPickerMap';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: LocationPreset) => Promise<void>;
  initialPreset?: LocationPreset | null;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPreset,
}) => {
  const [name, setName] = useState(initialPreset?.name || '');
  const [address, setAddress] = useState(initialPreset?.address || '');
  const [detailAddress, setDetailAddress] = useState(initialPreset?.detailAddress || '');
  const [entranceNote, setEntranceNote] = useState(initialPreset?.entranceNote || '');
  const [latitude, setLatitude] = useState(initialPreset?.latitude || 37.5665);
  const [longitude, setLongitude] = useState(initialPreset?.longitude || 126.978);
  const [radiusMeters, setRadiusMeters] = useState(initialPreset?.radiusMeters || 100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('장소 명칭을 입력해주세요.');
      return;
    }

    const isDefaultCoords = Math.abs(latitude - 37.5665) < 0.0001 && Math.abs(longitude - 126.978) < 0.0001;
    if (address.trim() && isDefaultCoords && !address.includes('명동')) {
      setErrorMsg('📍 지도 검색 또는 현재 위치 설정을 통해 실제 좌표를 지정해주세요. (기본 서울 명동 좌표로 잘못 저장되지 않도록 방지합니다.)');
      return;
    }

    const preset: LocationPreset = {
      id: initialPreset?.id || `loc_${Date.now()}`,
      name: name.trim(),
      address: address.trim() || undefined,
      detailAddress: detailAddress.trim() || undefined,
      entranceNote: entranceNote.trim() || undefined,
      latitude,
      longitude,
      radiusMeters,
      isDefault: initialPreset?.isDefault || false,
    };

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onSave(preset);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '장소 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-container member-profile-modal-modern"
        style={{ maxWidth: '640px', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-clean">
          <div className="profile-header-meta">
            <span className="profile-pill-tag">🗺️ 장소 등록 & 설정</span>
            <div className="profile-header-title-wrap">
              <h2 className="modal-heading-name">
                {initialPreset ? `'${initialPreset.name}' 장소 수정` : '새 연습실/공연장 등록'}
              </h2>
              <span className="modal-heading-sub">도로명 주소 검색 및 출석 인정 반경 설정</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-round-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="modal-body-scrollable">
          {errorMsg && (
            <div className="profile-alert-danger" style={{ marginBottom: '14px' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          <form id="location-picker-modal-form" onSubmit={handleSubmit}>
            <div className="modern-field-group" style={{ marginBottom: '16px' }}>
              <label className="modern-field-label">장소 명칭 *</label>
              <input
                type="text"
                className="modern-input"
                placeholder="예: 서초 앙상블 연습실, 명동성당 본당"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <LocationPickerMap
              lat={latitude}
              lon={longitude}
              radius={radiusMeters}
              address={address}
              detailAddress={detailAddress}
              entranceNote={entranceNote}
              onChangeLocation={(lat, lon, addr) => {
                setLatitude(lat);
                setLongitude(lon);
                if (addr) {
                  setAddress(addr);
                  if (!name.trim()) {
                    setName(addr.split(' ')[0] || addr);
                  }
                }
              }}
              onChangeDetailAddress={(detail) => setDetailAddress(detail)}
              onChangeEntranceNote={(note) => setEntranceNote(note)}
              onChangeRadius={(rad) => setRadiusMeters(rad)}
            />
          </form>
        </div>

        <div className="modal-footer-sticky" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ minHeight: '44px' }}
          >
            취소
          </button>
          <button
            type="submit"
            form="location-picker-modal-form"
            className="btn-modal-save"
            disabled={isSubmitting}
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? '저장 중...' : '장소 등록 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
