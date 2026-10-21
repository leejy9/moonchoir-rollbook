import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  resolveRoadAddressCoordinates,
  type KakaoGeocoderResult,
} from '../utils/kakaoAddress';
import { describeKakaoLoadError, loadKakaoServices } from '../utils/kakaoMaps';

export interface LocationPickerMapProps {
  lat: number;
  lon: number;
  radius: number;
  address?: string;
  detailAddress?: string;
  entranceNote?: string;
  onChangeLocation: (lat: number, lon: number, address?: string) => void;
  onAddressSelected?: (address: string) => void;
  onChangeDetailAddress?: (detail: string) => void;
  onChangeEntranceNote?: (note: string) => void;
  onChangeRadius: (radius: number) => void;
}

// Custom modern SVG marker for Leaflet
const createCustomMarker = () => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        position: relative;
        width: 34px;
        height: 34px;
        background: #5B3E96;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2.5px solid #FFFFFF;
        box-shadow: 0 4px 12px rgba(91, 62, 150, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 15px; user-select: none;">📍</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
};

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  lat,
  lon,
  radius,
  address = '',
  detailAddress = '',
  entranceNote = '',
  onChangeLocation,
  onAddressSelected,
  onChangeDetailAddress,
  onChangeEntranceNote,
  onChangeRadius,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [kakaoLoaded, setKakaoLoaded] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [postcodeLoadError, setPostcodeLoadError] = useState('');
  const [kakaoLoadError, setKakaoLoadError] = useState('');

  // 1. Load Kakao Maps Services SDK (shared, retry-safe loader)
  useEffect(() => {
    let cancelled = false;
    loadKakaoServices()
      .then(() => {
        if (!cancelled) setKakaoLoaded(true);
      })
      .catch((error) => {
        if (!cancelled) setKakaoLoadError(describeKakaoLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = lat || 37.5665;
    const initialLon = lon || 126.9780;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 16,
      zoomControl: true,
    });

    // OpenStreetMap standard tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Draggable Pin Marker
    const marker = L.marker([initialLat, initialLon], {
      icon: createCustomMarker(),
      draggable: true,
    }).addTo(map);

    // Attendance Radius Circle
    const circle = L.circle([initialLat, initialLon], {
      radius: radius || 100,
      color: '#5B3E96',
      fillColor: '#8B5CF6',
      fillOpacity: 0.22,
      weight: 2,
    }).addTo(map);

    // Marker drag event
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      onChangeLocation(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      setSearchFeedback(`📍 지도 핀 드래그로 위치가 설정되었습니다 (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`);
    });

    // Map click event
    map.on('click', (e: L.LeafletMouseEvent) => {
      const pos = e.latlng;
      marker.setLatLng(pos);
      circle.setLatLng(pos);
      onChangeLocation(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      setSearchFeedback(`📍 지도 클릭으로 위치가 설정되었습니다 (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync coords from parent
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lon) > 0.00001) {
        markerRef.current.setLatLng([lat, lon]);
        circleRef.current.setLatLng([lat, lon]);
        mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom(), { animate: true });
      }
    }
  }, [lat, lon]);

  // Sync radius from parent
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  const updateSelectedAddress = (
    selectedAddress: string,
    latitude: number,
    longitude: number
  ) => {
    onChangeLocation(latitude, longitude, selectedAddress);
    markerRef.current?.setLatLng([latitude, longitude]);
    circleRef.current?.setLatLng([latitude, longitude]);
    mapInstanceRef.current?.flyTo([latitude, longitude], 18, { duration: 1 });
  };

  // Open the road-address picker and resolve its building coordinates.
  const handleOpenDaumPostcode = () => {
    setPostcodeLoadError('');
    const scriptId = 'daum-postcode-script';
    const existingScript = document.getElementById(scriptId);

    const openPopup = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const daum = (window as any).daum;
      if (daum && daum.Postcode) {
        new daum.Postcode({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          oncomplete: (data: any) => {
            const roadAddr = data.roadAddress || data.jibunAddress;
            if (!roadAddr) {
              setSearchFeedback('⚠️ 선택한 주소에서 주소 정보를 확인할 수 없습니다.');
              return;
            }
            onAddressSelected?.(roadAddr);
            setPostcodeLoadError('');
            setSearchFeedback('주소 좌표를 확인하고 있습니다...');

            loadKakaoServices()
              .then(() => {
                setKakaoLoaded(true);
                setKakaoLoadError('');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const kakao = (window as any).kakao;
                const geocoder = new kakao.maps.services.Geocoder();
                geocoder.addressSearch(roadAddr, (result: KakaoGeocoderResult[], status: string) => {
                  if (status === kakao.maps.services.Status.OK && result && result.length > 0) {
                    const coordinates = resolveRoadAddressCoordinates(result[0]);
                    if (!coordinates) {
                      setSearchFeedback('⚠️ 주소는 찾았지만 좌표가 유효하지 않습니다. 아래 지도에서 건물 입구를 직접 선택해주세요.');
                      return;
                    }
                    updateSelectedAddress(roadAddr, coordinates.latitude, coordinates.longitude);
                    setSearchFeedback(
                      `✓ 도로명주소 좌표를 설정했습니다. 건물 입구와 핀이 다르면 지도를 눌러 조정해주세요. (${coordinates.latitude}, ${coordinates.longitude})`
                    );
                  } else {
                    setSearchFeedback('⚠️ 주소는 입력했지만 좌표 변환에 실패했습니다. 아래 지도에서 건물 입구를 직접 선택해주세요.');
                  }
                }, { analyze_type: 'EXACT' });
              })
              .catch((error) => {
                const reason = describeKakaoLoadError(error);
                setKakaoLoadError(reason);
                setSearchFeedback(`⚠️ ${reason} 지금은 아래 지도에서 건물 입구를 직접 선택해주세요.`);
              });
          },
        }).open();
      } else {
        setPostcodeLoadError('주소 검색 창을 불러오지 못했습니다. 다시 시도해주세요.');
      }
    };

    if ((window as any).daum?.Postcode) {
      openPopup();
    } else if (existingScript) {
      existingScript.addEventListener('load', openPopup, { once: true });
      existingScript.addEventListener(
        'error',
        () => setPostcodeLoadError('주소 검색 스크립트 로드에 실패했습니다. 네트워크 연결을 확인해주세요.'),
        { once: true }
      );
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload = openPopup;
      script.onerror = () => setPostcodeLoadError('주소 검색 스크립트 로드에 실패했습니다. 네트워크 연결을 확인해주세요.');
      document.body.appendChild(script);
    }
  };

  // 6. Current GPS button
  const handleGetCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert('브라우저가 위치 정보를 지원하지 않습니다.');
      return;
    }

    setIsLocatingGPS(true);
    setSearchFeedback(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGPS(false);
        const curLat = Number(pos.coords.latitude.toFixed(6));
        const curLon = Number(pos.coords.longitude.toFixed(6));
        onChangeLocation(curLat, curLon);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([curLat, curLon]);
          circleRef.current.setLatLng([curLat, curLon]);
          mapInstanceRef.current.flyTo([curLat, curLon], 17, { duration: 1.0 });
        }
        setSearchFeedback(`📍 현재 스마트폰/PC의 실제 GPS 좌표(${curLat}, ${curLon})로 설정되었습니다.`);
      },
      (err) => {
        setIsLocatingGPS(false);
        alert(`위치 정보 수신 실패: ${err.message}\n브라우저의 위치 권한을 확인해주세요.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="location-picker-map-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Road address lookup and current GPS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568', margin: 0 }}>
          주소 *
        </label>
        <span
          style={{
            fontSize: '11px',
            color: kakaoLoaded ? '#059669' : kakaoLoadError ? '#DC2626' : '#64748B',
            fontWeight: 600,
          }}
        >
          {kakaoLoaded
            ? '도로명주소 좌표 변환 연결됨'
            : kakaoLoadError || '도로명주소 좌표 서비스 연결 확인 중'}
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="modern-input"
            style={{ flex: 1, backgroundColor: '#F8FAFC', fontSize: '13.5px' }}
            placeholder="도로명주소 검색 버튼을 눌러 선택하세요"
            value={address}
            readOnly
          />
          <button
            type="button"
            className="btn-qr-action-primary"
            style={{ width: 'auto', padding: '0 14px', minHeight: '44px', fontSize: '13px', whiteSpace: 'nowrap' }}
            onClick={handleOpenDaumPostcode}
          >
            🏠 도로명주소 검색
          </button>
          <button
            type="button"
            className="btn-qr-action-secondary"
            onClick={handleGetCurrentGPS}
            disabled={isLocatingGPS}
            style={{ width: 'auto', padding: '0 12px', minHeight: '42px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
          >
            {isLocatingGPS ? '수신 중...' : '📍 현위치'}
          </button>
        </div>

        {postcodeLoadError && (
          <div role="alert" className="profile-alert-danger">
            {postcodeLoadError}
          </div>
        )}

        {searchFeedback && (
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: searchFeedback.startsWith('✓') ? '#059669' : searchFeedback.startsWith('⚠️') ? '#DC2626' : '#4F46E5',
              background: searchFeedback.startsWith('✓') ? '#ECFDF5' : searchFeedback.startsWith('⚠️') ? '#FEF2F2' : '#EEF2FF',
              padding: '6px 10px',
              borderRadius: '6px',
            }}
          >
            {searchFeedback}
          </div>
        )}

        {/* Detail Address Input */}
        <div>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568' }}>
            상세 주소 (층 / 호수)
          </label>
          <input
            type="text"
            className="modern-input"
            style={{ fontSize: '13.5px' }}
            placeholder="예: 4층 대연습실, 지하 1층 소극장"
            value={detailAddress}
            onChange={(e) => onChangeDetailAddress?.(e.target.value)}
          />
        </div>

        {/* Entrance Note Input */}
        <div>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568' }}>
            오시는 길 메모
          </label>
          <input
            type="text"
            className="modern-input"
            style={{ fontSize: '13.5px' }}
            placeholder="예: 정문 우측 계단 진입"
            value={entranceNote}
            onChange={(e) => onChangeEntranceNote?.(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Interactive Map Container with Coordinates Badge */}
      <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #E2E8F0', zIndex: 1 }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(30, 41, 59, 0.85)', color: '#FFFFFF', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          GPS: {lat.toFixed(5)}, {lon.toFixed(5)}
        </div>
        <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(255,255,255,0.92)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: '#4A5568', pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 1000 }}>
          💡 지도를 클릭하거나 핀을 드래그하여 출입구 위치를 미세 조정할 수 있습니다.
        </div>
      </div>

      {/* 4. Radius Control (Circle size) */}
      <div style={{ background: '#F8F5FE', padding: '12px 14px', borderRadius: '12px', border: '1px solid #ECEBFC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '13.5px', fontWeight: 700, color: '#282C48' }}>
            🎯 출석 인정 반경 설정: <strong style={{ color: '#5B3E96', fontSize: '15px' }}>{radius}m</strong>
          </label>
          <span style={{ fontSize: '12px', color: '#718096' }}>
            (지도 위 보라색 원 크기)
          </span>
        </div>

        {/* Quick preset buttons */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          {[50, 100, 150, 200, 300].map((presetMeters) => (
            <button
              key={presetMeters}
              type="button"
              className={`part-chip-btn ${radius === presetMeters ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '12.5px', padding: '4px 0' }}
              onClick={() => onChangeRadius(presetMeters)}
            >
              {presetMeters}m {presetMeters === 100 ? '(권장)' : ''}
            </button>
          ))}
        </div>

        {/* Range Slider */}
        <input
          type="range"
          min={30}
          max={500}
          step={10}
          value={radius}
          onChange={(e) => onChangeRadius(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#5B3E96', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#A0AEC0', marginTop: '2px' }}>
          <span>좁게 (30m)</span>
          <span>기본 권장 (100m)</span>
          <span>넓게 (500m)</span>
        </div>
      </div>
    </div>
  );
};
