import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LocationPickerMapProps {
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
  onSelectPlaceName?: (name: string) => void;
}

interface KakaoPlaceItem {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string; // lon
  y: string; // lat
  category_group_name?: string;
}

const KAKAO_APP_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY || '1465ed6063afca1d3ea91711cbdeb84a';

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
  onSelectPlaceName,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [kakaoLoaded, setKakaoLoaded] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KakaoPlaceItem[]>([]);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // 1. Dynamically Load Kakao Maps Services SDK
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.services) {
      setKakaoLoaded(true);
      return;
    }

    const scriptId = 'kakao-maps-sdk-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services&autoload=false`;
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kakao = (window as any).kakao;
      if (kakao && kakao.maps) {
        kakao.maps.load(() => {
          setKakaoLoaded(true);
        });
      }
    };

    script.addEventListener('load', handleLoad);
    return () => {
      script?.removeEventListener('load', handleLoad);
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

  // 3. Search Kakao Places Keyword
  const handleSearchKakaoPlaces = (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const query = searchKeyword.trim();
    if (!query) {
      alert('검색할 장소명 또는 도로명 주소를 입력해주세요.');
      return;
    }

    setIsSearching(true);
    setSearchFeedback(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakao = (window as any).kakao;
    if (kakao && kakao.maps && kakao.maps.services) {
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(query, (data: KakaoPlaceItem[], status: string) => {
        if (status === kakao.maps.services.Status.OK && data && data.length > 0) {
          setIsSearching(false);
          setSearchResults(data.slice(0, 6));
        } else {
          // If keyword search fails, try geocoder as fallback
          tryGeocodeWithKakao(query);
        }
      });
    } else {
      // Fallback if Kakao SDK not loaded
      tryGeocodeWithNominatim(query);
    }
  };

  const tryGeocodeWithKakao = (addressStr: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakao = (window as any).kakao;
    if (kakao && kakao.maps && kakao.maps.services) {
      const geocoder = new kakao.maps.services.Geocoder();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geocoder.addressSearch(addressStr, (result: any[], status: string) => {
        if (status === kakao.maps.services.Status.OK && result && result.length > 0) {
          setIsSearching(false);
          const item: KakaoPlaceItem = {
            id: `addr_${Date.now()}`,
            place_name: addressStr,
            road_address_name: result[0].road_address ? result[0].road_address.address_name : result[0].address_name,
            address_name: result[0].address_name,
            x: result[0].x,
            y: result[0].y,
            category_group_name: '주소검색결과',
          };
          setSearchResults([item]);
        } else {
          // 2차 시도: 복합 명사 분리 검색 (예: 서해문화회관 -> 서해 문화회관)
          const splitted = addressStr.replace(/([가-힣a-zA-Z0-9]+)(문화회관|연습실|아트홀|체육관|센터|성당|교회|회관|극장|스튜디오)/, '$1 $2').trim();
          if (splitted !== addressStr) {
            const ps = new kakao.maps.services.Places();
            ps.keywordSearch(splitted, (data: KakaoPlaceItem[], st: string) => {
              if (st === kakao.maps.services.Status.OK && data && data.length > 0) {
                setIsSearching(false);
                setSearchResults(data.slice(0, 6));
              } else {
                tryGeocodeWithNominatim(addressStr);
              }
            });
          } else {
            tryGeocodeWithNominatim(addressStr);
          }
        }
      });
    } else {
      tryGeocodeWithNominatim(addressStr);
    }
  };

  const tryGeocodeWithNominatim = async (queryText: string) => {
    try {
      const encoded = encodeURIComponent(queryText.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=kr&limit=3`,
        {
          headers: {
            'Accept-Language': 'ko,en',
            'User-Agent': 'MoonchoirRollbook/1.0',
          },
        }
      );
      setIsSearching(false);
      if (!res.ok) {
        handleGeocodeFailure(queryText);
        return;
      }
      const data = (await res.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
      if (data && data.length > 0) {
        const items: KakaoPlaceItem[] = data.map((d) => ({
          id: String(d.place_id),
          place_name: d.display_name.split(',')[0] || queryText,
          road_address_name: d.display_name,
          address_name: d.display_name,
          x: d.lon,
          y: d.lat,
          category_group_name: '오픈맵검색결과',
        }));
        setSearchResults(items);
      } else {
        handleGeocodeFailure(queryText);
      }
    } catch {
      setIsSearching(false);
      handleGeocodeFailure(queryText);
    }
  };

  const handleGeocodeFailure = (query: string) => {
    setSearchResults([]);
    setSearchFeedback(`⚠️ '${query}'에 대한 정확한 GPS 좌표를 찾지 못했습니다. 아래 지도에서 위치를 직접 클릭하거나 [📍 현재 내 위치로 설정]을 눌러주세요.`);
  };

  // 4. User selects a place item from search results
  const handleSelectPlace = (item: KakaoPlaceItem) => {
    const foundLat = Number(parseFloat(item.y).toFixed(6));
    const foundLon = Number(parseFloat(item.x).toFixed(6));
    const fullAddr = item.road_address_name || item.address_name;

    onChangeLocation(foundLat, foundLon, fullAddr);
    if (item.place_name && onSelectPlaceName) {
      onSelectPlaceName(item.place_name);
    }
    if (item.place_name && !detailAddress) {
      onChangeDetailAddress?.(item.place_name);
    }

    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([foundLat, foundLon]);
      circleRef.current.setLatLng([foundLat, foundLon]);
      mapInstanceRef.current.flyTo([foundLat, foundLon], 17, { duration: 1.0 });
    }

    setSearchResults([]);
    setSearchFeedback(`✓ [${item.place_name}] 위치가 지도에 정상 반영되었습니다. (${foundLat}, ${foundLon})`);
  };

  // 5. Open Daum/Kakao Postcode Popup
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

            // Trigger Kakao Geocoder to resolve coordinates for this road address
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const kakao = (window as any).kakao;
            if (kakao && kakao.maps && kakao.maps.services) {
              const geocoder = new kakao.maps.services.Geocoder();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              geocoder.addressSearch(roadAddr, (result: any[], status: string) => {
                if (status === kakao.maps.services.Status.OK && result && result.length > 0) {
                  const foundLat = Number(parseFloat(result[0].y).toFixed(6));
                  const foundLon = Number(parseFloat(result[0].x).toFixed(6));
                  onChangeLocation(foundLat, foundLon, fullAddress);
                  if (data.buildingName && onSelectPlaceName) {
                    onSelectPlaceName(data.buildingName);
                  }
                  if (mapInstanceRef.current && markerRef.current && circleRef.current) {
                    markerRef.current.setLatLng([foundLat, foundLon]);
                    circleRef.current.setLatLng([foundLat, foundLon]);
                    mapInstanceRef.current.flyTo([foundLat, foundLon], 17, { duration: 1.0 });
                  }
                  setSearchFeedback(`✓ 도로명 주소 [${fullAddress}]의 좌표를 성공적으로 찾았습니다.`);
                } else {
                  tryGeocodeWithNominatim(roadAddr);
                }
              });
            } else {
              tryGeocodeWithNominatim(roadAddr);
            }
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
      {/* 1. Kakao Places & Road Address Search Box */}
      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label className="form-label" style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', margin: 0 }}>
            🔍 장소명 또는 도로명 주소 검색
          </label>
          <span style={{ fontSize: '11px', color: kakaoLoaded ? '#059669' : '#64748B', fontWeight: 600 }}>
            {kakaoLoaded ? '⚡ 카카오맵 연동' : '🌐 검색 연동'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="modern-input"
            style={{ flex: 1, fontSize: '13.5px' }}
            placeholder="예: 예술의전당, 서해문화회관, 연수구 한나루로"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleSearchKakaoPlaces(e);
              }
            }}
          />
          <button
            type="button"
            className="btn-qr-action-primary"
            style={{ width: 'auto', padding: '0 16px', minHeight: '42px', fontSize: '13px', whiteSpace: 'nowrap' }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSearchKakaoPlaces(e);
            }}
            disabled={isSearching}
          >
            {isSearching ? '검색 중...' : '검색'}
          </button>
          <button
            type="button"
            className="btn-qr-action-secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOpenDaumPostcode();
            }}
            style={{ width: 'auto', padding: '0 12px', minHeight: '42px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
            title="다음 우편번호 팝업 열기"
          >
            우편번호
          </button>
        </div>

        {/* Search feedback note */}
        {searchFeedback && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              fontWeight: 600,
              color: searchFeedback.startsWith('✓') ? '#059669' : searchFeedback.startsWith('⚠️') ? '#DC2626' : '#4F46E5',
              background: searchFeedback.startsWith('✓') ? '#ECFDF5' : searchFeedback.startsWith('⚠️') ? '#FEF2F2' : '#EEF2FF',
              padding: '6px 10px',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <span>{searchFeedback}</span>
            {searchFeedback.startsWith('⚠️') && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenDaumPostcode();
                }}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                우편번호로 정확한 주소 찾기 ↗
              </button>
            )}
          </div>
        )}

        {/* Search Results Dropdown List */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: '8px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              maxHeight: '190px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ padding: '6px 10px', background: '#F1F5F9', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
              검색 결과 ({searchResults.length}건) — 등록할 장소를 클릭하세요:
            </div>
            {searchResults.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectPlace(item)}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #F1F5F9',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF2FF')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#1E293B' }}>{item.place_name}</strong>
                  {item.category_group_name && (
                    <span style={{ fontSize: '11px', color: '#6366F1', background: '#EEF2FF', padding: '1px 6px', borderRadius: '4px' }}>
                      {item.category_group_name}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                  {item.road_address_name || item.address_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Direct Address Input & One-Touch GPS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#4A5568', margin: 0 }}>
            기본 도로명 주소 *
          </label>
          <button
            type="button"
            className="btn-qr-action-secondary"
            onClick={handleGetCurrentGPS}
            disabled={isLocatingGPS}
            style={{ width: 'auto', padding: '4px 10px', minHeight: '32px', fontSize: '12px' }}
          >
            {isLocatingGPS ? 'GPS 수신 중...' : '📍 현재 내 위치로 설정'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            className="modern-input"
            style={{ flex: 1, backgroundColor: '#F8FAFC', fontSize: '13.5px' }}
            placeholder="상단 검색 또는 우측 [주소 검색] 버튼을 눌러주세요"
            value={address}
            onChange={(e) => onChangeLocation(lat, lon, e.target.value)}
          />
          <button
            type="button"
            className="btn-qr-action-secondary"
            style={{ width: 'auto', padding: '0 14px', fontSize: '13px', whiteSpace: 'nowrap', minHeight: '42px' }}
            onClick={handleOpenDaumPostcode}
          >
            주소 검색
          </button>
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
