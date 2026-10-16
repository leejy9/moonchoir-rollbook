import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerMapProps {
  lat: number;
  lon: number;
  radius: number;
  address?: string;
  detailAddress?: string;
  entranceNote?: string;
  onChangeLocation: (lat: number, lon: number, address?: string) => void;
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
  onChangeDetailAddress,
  onChangeEntranceNote,
  onChangeRadius,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [isLocatingGPS, setIsLocatingGPS] = useState(false);

  // Initialize Leaflet Map
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
    });

    // Map click event
    map.on('click', (e: L.LeafletMouseEvent) => {
      const pos = e.latlng;
      marker.setLatLng(pos);
      circle.setLatLng(pos);
      onChangeLocation(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
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

  // Geocode official road address to lat/lon using Nominatim
  const geocodeAddress = async (queryText: string) => {
    if (!queryText.trim()) return;
    try {
      const encoded = encodeURIComponent(queryText.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=kr&limit=1`,
        {
          headers: {
            'Accept-Language': 'ko,en',
          },
        }
      );

      if (!res.ok) return;

      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data && data.length > 0) {
        const foundLat = Number(parseFloat(data[0].lat).toFixed(6));
        const foundLon = Number(parseFloat(data[0].lon).toFixed(6));

        onChangeLocation(foundLat, foundLon);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([foundLat, foundLon]);
          circleRef.current.setLatLng([foundLat, foundLon]);
          mapInstanceRef.current.flyTo([foundLat, foundLon], 17, { duration: 1.2 });
        }
      }
    } catch {
      // Nominatim error fallback
    }
  };

  // Open Daum/Kakao Postcode Popup
  const handleOpenDaumPostcode = () => {
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
            const bname = data.buildingName ? ` (${data.buildingName})` : '';
            const fullAddress = roadAddr + bname;
            onChangeLocation(lat, lon, fullAddress);
            geocodeAddress(roadAddr);
          },
        }).open();
      } else {
        alert('주소 검색 스크립트 로드 중입니다. 잠시 후 다시 시도해주세요.');
      }
    };

    if (existingScript) {
      openPopup();
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload = openPopup;
      document.body.appendChild(script);
    }
  };

  // Current GPS button
  const handleGetCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert('브라우저가 위치 정보를 지원하지 않습니다.');
      return;
    }

    setIsLocatingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGPS(false);
        const curLat = Number(pos.coords.latitude.toFixed(6));
        const curLon = Number(pos.coords.longitude.toFixed(6));
        onChangeLocation(curLat, curLon);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([curLat, curLon]);
          circleRef.current.setLatLng([curLat, curLon]);
          mapInstanceRef.current.flyTo([curLat, curLon], 17, { duration: 1.2 });
        }
      },
      (err) => {
        setIsLocatingGPS(false);
        alert(`위치 정보 수신 실패: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  return (
    <div className="location-picker-map-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 1. Address Search Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-qr-action-primary"
          onClick={handleOpenDaumPostcode}
          style={{ flex: '1 1 200px', minHeight: '44px', fontSize: '13.5px', padding: '0 14px' }}
        >
          🔍 도로명 주소 검색 (다음/카카오)
        </button>

        <button
          type="button"
          className="btn-qr-action-secondary"
          onClick={handleGetCurrentGPS}
          disabled={isLocatingGPS}
          style={{ flex: '1 1 160px', minHeight: '44px', fontSize: '13.5px', padding: '0 14px' }}
        >
          {isLocatingGPS ? 'GPS 수신 중...' : '📍 현재 내 위치로 핀 찍기'}
        </button>
      </div>

      {/* 2. Three-stage address input: Basic Road Address, Detail Address, Entrance Note */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Road Address Display */}
        <div>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568' }}>
            기본 주소 (도로명) *
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              className="modern-input"
              style={{ flex: 1, backgroundColor: '#F8FAFC', cursor: 'pointer', fontSize: '13.5px' }}
              readOnly
              placeholder="위의 [도로명 주소 검색] 버튼을 눌러주세요"
              value={address}
              onClick={handleOpenDaumPostcode}
            />
            <button
              type="button"
              className="btn-qr-action-secondary"
              style={{ width: 'auto', padding: '0 14px', fontSize: '13px', whiteSpace: 'nowrap', minHeight: '42px' }}
              onClick={handleOpenDaumPostcode}
            >
              주소 변경
            </button>
          </div>
        </div>

        {/* Detail Address Input */}
        <div>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568' }}>
            상세 주소 (층 / 호수 / 연습실명)
          </label>
          <input
            type="text"
            className="modern-input"
            style={{ fontSize: '13.5px' }}
            placeholder="예: 대경빌딩 4층 대연습실, 지하 1층 소극장"
            value={detailAddress}
            onChange={(e) => onChangeDetailAddress?.(e.target.value)}
          />
        </div>

        {/* Entrance Note Input */}
        <div>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568' }}>
            입구 위치 / 진입 방법 (오시는 길 안내)
          </label>
          <input
            type="text"
            className="modern-input"
            style={{ fontSize: '13.5px' }}
            placeholder="예: 정문 우측 계단으로 진입 / 후문 주차장 엘리베이터 이용"
            value={entranceNote}
            onChange={(e) => onChangeEntranceNote?.(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Interactive Map Container */}
      <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #E2E8F0', zIndex: 1 }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
