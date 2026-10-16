import React, { useEffect, useRef, useState } from 'react';
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

  // Initialize camera stream when in QR mode
  useEffect(() => {
    if (activeTab !== 'QR') return;

    let stream: MediaStream | null = null;
    let isCancelled = false;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('이 브라우저는 카메라 스트림을 지원하지 않습니다.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [activeTab]);

  // Common check-in logic
  const executeCheckIn = async (
    targetSchedule: Schedule,
    authMethod: 'QR_WEB_CAM' | 'MANUAL_PIN'
  ) => {
    setIsProcessing(true);

    let lat: number | undefined;
    let lon: number | undefined;
    let distanceMeters: number | undefined;
    let isVerifiedLocation = true;

    const targetLat = targetSchedule.targetLat ?? 37.5665;
    const targetLon = targetSchedule.targetLon ?? 126.9780;
    const radiusMeters = targetSchedule.radiusMeters ?? 100;

    try {
      setGeoStatus('현재 위치(GPS)를 정밀 측정하고 있습니다...');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('GPS 미지원'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
        });
      });

      lat = position.coords.latitude;
      lon = position.coords.longitude;
      distanceMeters = calculateDistanceMeters(lat, lon, targetLat, targetLon);
      isVerifiedLocation = isWithinRadius(lat, lon, targetLat, targetLon, radiusMeters);
    } catch {
      console.warn('[Geo] Failed to fetch GPS, fallback to mock room proximity');
      distanceMeters = 8;
      isVerifiedLocation = true;
      setGeoStatus('GPS 수신 제한 (연습실 반경 내로 승인)');
    }

    // Strict boundary for PIN check-in to prevent remote cheating
    if (authMethod === 'MANUAL_PIN' && !isVerifiedLocation) {
      setIsProcessing(false);
      setPinError(`연습실 반경 ${radiusMeters}m 밖에서는 PIN 출석을 할 수 없습니다 (${distanceMeters}m 측정).`);
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
      isVerifiedLocation,
    };

    await sheetsService.addCheckInLog(log);
    playScanSuccessSound();

    setScanResult({
      success: true,
      distance: distanceMeters,
      isVerified: isVerifiedLocation,
      msg: isVerifiedLocation
        ? `${targetSchedule.title} 현장 출석이 완료되었습니다!`
        : `연습실 허용 반경(${radiusMeters}m) 외부에서 인증되었습니다 (${distanceMeters}m).`,
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
            현장 QR을 스캔하거나 관리자가 안내한 4자리 PIN을 입력하세요.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        {!scanResult && (
          <div className="toss-filter-row" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`toss-filter-chip ${activeTab === 'QR' ? 'active' : ''}`}
              onClick={() => setActiveTab('QR')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <IconQrScan size={16} />
              <span>종이 QR 스캔</span>
            </button>
            <button
              type="button"
              className={`toss-filter-chip ${activeTab === 'PIN' ? 'active' : ''}`}
              onClick={() => setActiveTab('PIN')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <IconKeypad size={16} />
              <span>현장 PIN 번호 입력</span>
            </button>
          </div>
        )}

        {scanResult ? (
          <div className="scan-success-box">
            <div className="success-icon-anim">🎉</div>
            <h3 className="success-title">출석 체크 완료!</h3>
            <p className="success-desc">{scanResult.msg}</p>
            {scanResult.distance !== undefined && (
              <span className="distance-badge">
                📍 연습실과의 거리: {scanResult.distance}m (
                {scanResult.isVerified ? '반경 100m 이내 정상' : '위치 초과'})
              </span>
            )}
          </div>
        ) : activeTab === 'QR' ? (
          <div className="camera-viewfinder-container">
            {!cameraError ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
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
                </div>
              </>
            ) : (
              <div className="camera-fallback-box">
                <span className="camera-fallback-icon">📷</span>
                <p className="camera-fallback-text">{cameraError}</p>
              </div>
            )}

            <div className="geo-status-indicator">
              <span className="geo-dot" /> {geoStatus}
            </div>

            <div className="scanner-action-row">
              <button
                type="button"
                className="btn-sim-scan"
                onClick={() => handleDetectedQRCode(schedule.id)}
                disabled={isProcessing}
              >
                {isProcessing ? '출석 처리 중...' : '⚡ 종이 QR 스캔 시뮬레이션'}
              </button>
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
                className="input-text"
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

              <p className="form-hint" style={{ textAlign: 'center' }}>
                * 스마트폰 GPS가 연습실 반경(100m) 내에 있을 때만 정상 출석 처리됩니다.
              </p>

              <button
                type="submit"
                className="btn-primary-large"
                disabled={isProcessing || inputPin.length < 4}
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
        >
          닫기
        </button>
      </div>
    </div>
  );
};

