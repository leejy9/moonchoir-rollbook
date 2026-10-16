import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, RawAttendanceLog, Schedule } from '../types/rollbook';
import { calculateDistanceMeters, isWithinRadius } from '../utils/geo';
import { findActiveScheduleForMasterQR, parseQRPayload, playScanSuccessSound, verifySchedulePin } from '../utils/qr';
import { IconKeypad, IconQrScan } from './Icons';

interface QRScannerModalProps {
  schedule: Schedule;
  profile: BoundDeviceProfile;
  onClose: () => void;
  onSuccess: (log: RawAttendanceLog) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  schedule,
  profile,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'QR' | 'PIN'>('QR');
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>('위치 정보 확인 중...');
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    distance?: number;
    isVerified: boolean;
    msg: string;
  } | null>(null);

  // Common check-in logic
  const executeCheckIn = async (
    targetSchedule: Schedule,
    authMethod: 'QR_WEB_CAM' | 'MANUAL_PIN'
  ) => {
    setIsProcessing(true);

    let lat: number | undefined;
    let lon: number | undefined;
    let distanceMeters: number | undefined;
    let isVerifiedLocation = false;

    // Dynamically resolve target GPS coords and radius from location presets
    const locInfo = sheetsService.resolveScheduleLocation(targetSchedule);
    const targetLat = locInfo.targetLat;
    const targetLon = locInfo.targetLon;
    const radiusMeters = locInfo.radiusMeters;
    const venueName = locInfo.locationName;

    try {
      setGeoStatus('현재 위치(GPS)를 정밀 측정하고 있습니다...');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('GPS 미지원'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });

      lat = position.coords.latitude;
      lon = position.coords.longitude;
      distanceMeters = calculateDistanceMeters(lat, lon, targetLat, targetLon);
      isVerifiedLocation = isWithinRadius(lat, lon, targetLat, targetLon, radiusMeters);
    } catch {
      console.warn('[Geo] Failed to fetch GPS coordinates');
      distanceMeters = undefined;
      isVerifiedLocation = false;
      setGeoStatus('GPS 수신 제한 (위치 권한 확인 필요)');
    }

    // Strict boundary check for both QR and PIN to prevent remote check-in
    if (distanceMeters === undefined) {
      setIsProcessing(false);
      setScanResult({
        success: false,
        distance: undefined,
        isVerified: false,
        msg: `기기의 위치(GPS) 정보를 수신할 수 없습니다. 브라우저 위치 권한을 허용한 뒤 연습실 현장에서 다시 시도해 주세요.`,
      });
      return;
    }

    if (!isVerifiedLocation) {
      setIsProcessing(false);
      const distFormatted = distanceMeters >= 1000
        ? `${(distanceMeters / 1000).toFixed(1)}km`
        : `${distanceMeters}m`;

      if (authMethod === 'MANUAL_PIN') {
        setPinError(`연습실 반경 ${radiusMeters}m 밖에서는 PIN 출석을 할 수 없습니다 (${distFormatted} 측정).`);
      }

      setScanResult({
        success: false,
        distance: distanceMeters,
        isVerified: false,
        msg: `현재 위치가 '${venueName}' 출석 인정 반경(${radiusMeters}m) 밖입니다 (${distFormatted} 떨어짐). 연습실 현장에 도착 후 출석을 진행해 주세요.`,
      });
      return;
    }

    const log: RawAttendanceLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      scheduleId: targetSchedule.id,
      memberId: profile.memberId,
      memberName: profile.name,
      part: profile.part,
      authMethod,
      latitude: lat,
      longitude: lon,
      distanceMeters,
      isVerifiedLocation: true,
    };

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // Haptic vibrate might be restricted
    }

    await sheetsService.addCheckInLog(log);
    playScanSuccessSound();

    setScanResult({
      success: true,
      distance: distanceMeters,
      isVerified: true,
      msg: `${targetSchedule.title} [${venueName}] 현장 출석이 완료되었습니다!`,
    });

    setTimeout(() => {
      onSuccess(log);
    }, 1200);
  };

  // Process QR
  const handleDetectedQRCode = async (rawCode: string) => {
    if (isProcessing) return;
    const parsed = parseQRPayload(rawCode);

    let targetSchedule = schedule;
    if (parsed.type === 'MASTER_WALL_QR') {
      const activeSch = findActiveScheduleForMasterQR(sheetsService.getSchedules());
      if (activeSch) targetSchedule = activeSch;
    } else if (parsed.scheduleId) {
      const sch = sheetsService.getSchedules().find((s) => s.id === parsed.scheduleId);
      if (sch) targetSchedule = sch;
    }

    await executeCheckIn(targetSchedule, 'QR_WEB_CAM');
  };

  // Image file QR scanner fallback
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code && code.data && code.data.trim()) {
          handleDetectedQRCode(code.data.trim());
        } else {
          alert('선택하신 이미지에서 QR 코드를 인식하지 못했습니다. 더 선명한 사진을 선택하거나 직접 스캔해주세요.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Real-time camera stream + dual decode (BarcodeDetector + jsQR fallback)
  useEffect(() => {
    if (activeTab !== 'QR' || scanResult !== null) return;

    let stream: MediaStream | null = null;
    let animId: number | null = null;
    let isCancelled = false;
    let lastScanTime = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Initialize native BarcodeDetector if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let barcodeDetector: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    const scanFrame = async () => {
      if (isCancelled || isProcessing) return;

      const video = videoRef.current;
      const now = performance.now();

      // Throttle scanning to every 80ms for optimal performance & battery
      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        now - lastScanTime >= 80
      ) {
        lastScanTime = now;
        let detectedPayload: string | null = null;

        // 1. Try native hardware BarcodeDetector first
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detectedPayload = barcodes[0].rawValue.trim();
            }
          } catch {
            // fallback to jsQR
          }
        }

        // 2. Fallback to jsQR on canvas
        if (!detectedPayload && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          try {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });

            if (code && code.data && code.data.trim()) {
              detectedPayload = code.data.trim();
            }
          } catch {
            // Ignore partial decode glitches
          }
        }

        if (detectedPayload && !isCancelled) {
          handleDetectedQRCode(detectedPayload);
          return;
        }
      }

      if (!isCancelled) {
        animId = requestAnimationFrame(scanFrame);
      }
    };

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('이 브라우저는 카메라 스트림을 지원하지 않습니다.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          animId = requestAnimationFrame(scanFrame);
        }
      } catch (err: unknown) {
        console.warn('[Camera] Failed to access camera:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setCameraError(`카메라 접근 불가: ${errMsg}. 현장 PIN 입력 탭을 이용해주세요.`);
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isProcessing, scanResult]);

  // Process PIN
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    if (inputPin.trim().length < 4) {
      setPinError('4자리 PIN 번호를 모두 입력해주세요.');
      return;
    }

    if (!verifySchedulePin(schedule, inputPin)) {
      setPinError('입력하신 PIN 번호가 일치하지 않습니다. 관리자에게 문의하세요.');
      return;
    }

    await executeCheckIn(schedule, 'MANUAL_PIN');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card scanner-card">
        <div className="modal-header">
          <div className="modal-badge">{schedule.title}</div>
          <h2 className="modal-title">{profile.name} 님 출석 체크</h2>
          <p className="modal-desc">
            연습실 벽면의 상설 QR 또는 주간 QR을 카메라에 비춰주세요.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        {!scanResult && (
          <div className="tab-pill-group" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`tab-pill ${activeTab === 'QR' ? 'active' : ''}`}
              onClick={() => setActiveTab('QR')}
            >
              <IconQrScan size={16} />
              <span>종이 QR 스캔</span>
            </button>
            <button
              type="button"
              className={`tab-pill ${activeTab === 'PIN' ? 'active' : ''}`}
              onClick={() => setActiveTab('PIN')}
            >
              <IconKeypad size={16} />
              <span>현장 PIN 번호 입력</span>
            </button>
          </div>
        )}

        {scanResult ? (
          <div className={`scan-success-box ${scanResult.success ? '' : 'is-error'}`}>
            <div className="success-icon-anim">{scanResult.success ? '🎉' : '⚠️'}</div>
            <h3 className="success-title">{scanResult.success ? '출석 체크 완료!' : '현장 위치 불일치'}</h3>
            <p className="success-desc" style={{ color: scanResult.success ? '#191f28' : '#EF4444', wordBreak: 'keep-all' }}>
              {scanResult.msg}
            </p>
            {scanResult.distance !== undefined && (
              <span
                className="distance-badge"
                style={{
                  backgroundColor: scanResult.isVerified ? '#ECFDF5' : '#FEF2F2',
                  color: scanResult.isVerified ? '#059669' : '#DC2626',
                  borderColor: scanResult.isVerified ? '#A7F3D0' : '#FECACA',
                }}
              >
                📍 연습실과의 거리: {scanResult.distance >= 1000 ? `${(scanResult.distance / 1000).toFixed(1)}km` : `${scanResult.distance}m`} (
                {scanResult.isVerified ? '반경 이내 정상' : '인정 반경 초과'})
              </span>
            )}
            {!scanResult.success && (
              <button
                type="button"
                className="btn-qr-action-secondary"
                style={{ marginTop: '16px', minHeight: '44px', width: '100%' }}
                onClick={() => {
                  setScanResult(null);
                  setIsProcessing(false);
                }}
              >
                다시 스캔 시도하기
              </button>
            )}
          </div>
        ) : activeTab === 'QR' ? (
          <div>
            <div className="camera-viewfinder-container">
              {!cameraError ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="camera-video-stream"
                  />
                  <div className="viewfinder-overlay">
                    <div className="viewfinder-box">
                      <div className="viewfinder-laser" />
                      <span className="corner top-left" />
                      <span className="corner top-right" />
                      <span className="corner bottom-left" />
                      <span className="corner bottom-right" />
                    </div>
                    <div className="viewfinder-hint-text">
                      QR 코드를 사각형 안에 비추면 자동으로 인식됩니다
                    </div>
                  </div>
                </>
              ) : (
                <div className="camera-fallback-box">
                  <span className="camera-fallback-icon">📷</span>
                  <p className="camera-fallback-text">{cameraError}</p>
                </div>
              )}
            </div>

            {/* Below Camera Controls */}
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <div className="geo-status-indicator">
                <span className="geo-dot" /> {geoStatus}
              </div>

              {/* Album photo QR scanner option */}
              <div style={{ marginTop: '10px' }}>
                <label
                  style={{
                    fontSize: '12.5px',
                    color: '#5B3E96',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 14px',
                    background: '#F8F5FE',
                    borderRadius: '8px',
                    border: '1px solid #ECEBFC',
                    fontWeight: 600,
                  }}
                >
                  <span>🖼️ 앨범에서 QR 사진 선택</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </label>
              </div>

              {/* Dev simulator button at bottom */}
              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-sim-scan"
                  onClick={() => handleDetectedQRCode(schedule.id)}
                  disabled={isProcessing}
                  style={{
                    fontSize: '12px',
                    padding: '6px 12px',
                    background: 'transparent',
                    color: '#718096',
                    border: '1px dashed #CBD5E0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {isProcessing ? '출석 처리 중...' : '⚡ 카메라 없는 환경용: 출석 테스트'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PIN Input Mode */
          <div className="pin-mode-container" style={{ padding: '12px 0' }}>
            <form onSubmit={handlePinSubmit} className="form-stack">
              <label className="form-label" style={{ textAlign: 'center', fontSize: '15px' }}>
                관리자가 공지한 현장 PIN 4자리
              </label>

              <input
                type="tel"
                maxLength={4}
                autoFocus
                className="modern-input"
                style={{
                  fontSize: '28px',
                  letterSpacing: '12px',
                  textAlign: 'center',
                  fontWeight: 700,
                  height: '56px',
                }}
                placeholder="••••"
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value.replace(/\D/g, ''))}
              />

              {pinError && (
                <div className="error-banner" style={{ fontSize: '13px' }}>
                  {pinError}
                </div>
              )}

              <p className="form-hint" style={{ textAlign: 'center', fontSize: '12px', color: '#718096', marginTop: '6px' }}>
                * 스마트폰 GPS가 연습실 반경 내에 있을 때 정상 출석 처리됩니다.
              </p>

              <button
                type="submit"
                className="btn-primary-large"
                disabled={isProcessing || inputPin.length < 4}
                style={{ marginTop: '12px' }}
              >
                {isProcessing ? '위치 검증 및 출석 처리 중...' : '현장 PIN으로 출석하기'}
              </button>
            </form>
          </div>
        )}

        <button
          type="button"
          className="btn-secondary-cancel"
          onClick={onClose}
          disabled={isProcessing}
          style={{ marginTop: '12px' }}
        >
          닫기
        </button>
      </div>
    </div>
  );
};
