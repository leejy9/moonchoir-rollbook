import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { sheetsService } from '../services/sheets';
import type { BoundDeviceProfile, RawAttendanceLog, Schedule } from '../types/rollbook';
import { calculateDistanceMeters, isWithinRadius } from '../utils/geo';
import { findActiveScheduleForMasterQR, parseQRPayload, playScanSuccessSound } from '../utils/qr';
import { getKSTTimestampString } from '../utils/date';
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
  const [geoStatus, setGeoStatus] = useState<string>('위치(GPS) 확인 중...');
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    distance?: number;
    isVerified: boolean;
    msg: string;
  } | null>(null);
  const [savedLog, setSavedLog] = useState<RawAttendanceLog | null>(null);
  const [successTimeStr, setSuccessTimeStr] = useState('');

  const currentMember = sheetsService.getMembers().find((m) => m.id === profile.memberId);
  const currentPart = currentMember?.part || profile.part;
  const currentName = currentMember?.name || profile.name;

  // Common check-in execution
  const executeCheckIn = async (
    targetSchedule: Schedule,
    authMethod: 'QR_WEB_CAM' | 'MANUAL_PIN',
    checkInPin?: string
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
      setGeoStatus('현재 위치(GPS) 정밀 측정 중...');
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
        msg: `현재 위치가 '${venueName}' 출석 인정 반경(${radiusMeters}m) 밖입니다 (${distFormatted} 떨어짐). 연습실에 도착하신 후 다시 시도해 주세요.`,
      });
      return;
    }

    const log: RawAttendanceLog = {
      id: `log_${Date.now()}`,
      timestamp: getKSTTimestampString(),
      scheduleId: targetSchedule.id,
      memberId: profile.memberId,
      memberName: currentName,
      part: currentPart,
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

    try {
      await sheetsService.addCheckInLog(log, checkInPin);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '구글 시트에서 출석 저장을 확인하지 못했습니다.';
      setIsProcessing(false);
      setPinError(message);
      setScanResult({
        success: false,
        distance: distanceMeters,
        isVerified: true,
        msg: message,
      });
      return;
    }
    playScanSuccessSound();

    const timeLabel = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    setSuccessTimeStr(`${timeLabel} 정상 인증`);

    setSavedLog(log);
    setIsProcessing(false);
    setScanResult({
      success: true,
      distance: distanceMeters,
      isVerified: true,
      msg: `${targetSchedule.title} [${venueName}] 현장 출석이 완료되었습니다!`,
    });
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

  const handleDetectedQRCodeRef = useRef(handleDetectedQRCode);
  useEffect(() => {
    handleDetectedQRCodeRef.current = handleDetectedQRCode;
  });

  // Real-time camera stream + dual decode (BarcodeDetector + jsQR fallback)
  useEffect(() => {
    if (activeTab !== 'QR' || scanResult !== null) return;

    let stream: MediaStream | null = null;
    let animId: number | null = null;
    let isCancelled = false;
    let detector: any = null;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BD = (window as any).BarcodeDetector;
        detector = new BD({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }

    async function startCamera() {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          scanFrame();
        }
      } catch (err: unknown) {
        console.error('[QRScanner] Camera access error:', err);
        setCameraError('카메라를 실행할 수 없습니다. 브라우저 카메라 권한을 허용해주세요.');
      }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function scanFrame() {
      if (isCancelled) return;

      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              handleDetectedQRCodeRef.current(barcodes[0].rawValue);
              return;
            }
          } catch {
            // Detector failed this frame, fallback
          }
        }

        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data && code.data.trim()) {
            handleDetectedQRCodeRef.current(code.data.trim());
            return;
          }
        }
      }

      animId = requestAnimationFrame(scanFrame);
    }

    startCamera();

    return () => {
      isCancelled = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [activeTab, scanResult]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setPinError('');

    if (inputPin.trim().length < 4) {
      setPinError('4자리 PIN 번호를 모두 입력해주세요.');
      return;
    }

    setIsProcessing(true);
    try {
      await sheetsService.verifyOnSitePin(inputPin);
    } catch (err: unknown) {
      setIsProcessing(false);
      setPinError(
        err instanceof Error
          ? err.message
          : '현장 PIN 확인에 실패했습니다. 인터넷 연결을 확인해주세요.'
      );
      return;
    }

    await executeCheckIn(schedule, 'MANUAL_PIN', inputPin);
  };

  const handleFinishSuccess = () => {
    if (savedLog) {
      onSuccess(savedLog);
    } else {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(15, 23, 42, 0.75)' }}>
      <div
        className="modal-card"
        style={{
          maxWidth: '440px',
          width: '92%',
          padding: '24px 20px',
          borderRadius: '24px',
          background: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          position: 'relative',
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1', background: '#EEF2FF', padding: '3px 8px', borderRadius: '6px' }}>
              🎵 문콰이어 출석 체크
            </span>
            <h2 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#1E293B' }}>
              {currentName} 님 <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }}>({currentPart})</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              background: '#F1F5F9',
              color: '#64748B',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* ============================================================== */}
        {/* 1. SUCCESS CELEBRATION VIEW (긍정적 경험 극대화)                 */}
        {/* ============================================================== */}
        {scanResult?.success ? (
          <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#ffffff',
                fontSize: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.5)',
                animation: 'bounce 0.6s ease-in-out',
              }}
            >
              🎉
            </div>

            <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
              인증에 성공했어요! 🎉
            </h3>

            <p style={{ fontSize: '15px', color: '#334155', fontWeight: 600, margin: '0 0 16px', lineHeight: 1.5, wordBreak: 'keep-all' }}>
              {profile.name} 단원님, 환영합니다! 오늘 활동도 힘차고 즐겁게 시작해봐요! 🎵
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#64748B',
                marginBottom: '20px',
              }}
            >
              <span>📍 {schedule.locationName}</span>
              <span>·</span>
              <span>⏰ {successTimeStr || '정상 인증 완료'}</span>
            </div>

            <button
              type="button"
              onClick={handleFinishSuccess}
              style={{
                width: '100%',
                minHeight: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #4F46E5, #4338CA)',
                color: '#FFFFFF',
                fontSize: '16px',
                fontWeight: 800,
                border: 'none',
                boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.4)',
                cursor: 'pointer',
              }}
            >
              오늘 연습 힘차게 시작하기 🎵
            </button>
          </div>
        ) : scanResult && !scanResult.success ? (
          /* ============================================================== */
          /* 2. ERROR / LOCATION MISMATCH VIEW                              */
          /* ============================================================== */
          <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
            <div
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                fontSize: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              ⚠️
            </div>

            <h3 style={{ fontSize: '19px', fontWeight: 800, color: '#991B1B', margin: '0 0 8px' }}>
              현장 위치 확인 실패
            </h3>

            <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 16px', lineHeight: 1.5, wordBreak: 'keep-all' }}>
              {scanResult.msg}
            </p>

            <button
              type="button"
              onClick={() => {
                setScanResult(null);
                setIsProcessing(false);
              }}
              style={{
                width: '100%',
                minHeight: '48px',
                borderRadius: '12px',
                background: '#1E293B',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              다시 스캔 시도하기 ↺
            </button>
          </div>
        ) : (
          /* ============================================================== */
          /* 3. ACTIVE SCANNING VIEW (LARGE VIEWFINDER)                      */
          /* ============================================================== */
          <div>
            {/* Minimal Mode Tab Switcher */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('QR')}
                style={{
                  flex: 1,
                  minHeight: '40px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeTab === 'QR' ? '#4F46E5' : '#E2E8F0'}`,
                  background: activeTab === 'QR' ? '#EEF2FF' : '#FFFFFF',
                  color: activeTab === 'QR' ? '#4F46E5' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <IconQrScan size={16} />
                <span>카메라 QR 스캔</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PIN')}
                style={{
                  flex: 1,
                  minHeight: '40px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeTab === 'PIN' ? '#4F46E5' : '#E2E8F0'}`,
                  background: activeTab === 'PIN' ? '#EEF2FF' : '#FFFFFF',
                  color: activeTab === 'PIN' ? '#4F46E5' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <IconKeypad size={16} />
                <span>현장 PIN 번호</span>
              </button>
            </div>

            {activeTab === 'QR' ? (
              <div>
                {/* Large Responsive Camera Box */}
                <div
                  style={{
                    width: '100%',
                    height: '320px',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#000000',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {!cameraError ? (
                    <>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <div className="viewfinder-overlay">
                        <div className="viewfinder-box" style={{ width: '220px', height: '220px' }}>
                          <div className="viewfinder-laser" />
                          <span className="corner top-left" />
                          <span className="corner top-right" />
                          <span className="corner bottom-left" />
                          <span className="corner bottom-right" />
                        </div>
                        <div
                          style={{
                            marginTop: '16px',
                            color: '#FFFFFF',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            textAlign: 'center',
                            padding: '0 16px',
                          }}
                        >
                          벽면의 QR 코드를 사각형 안에 비춰주세요
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#FFFFFF', textAlign: 'center', padding: '24px' }}>
                      <span style={{ fontSize: '36px', display: 'block', marginBottom: '10px' }}>📷</span>
                      <p style={{ fontSize: '13px', margin: 0, color: '#FECACA' }}>{cameraError}</p>
                    </div>
                  )}
                </div>

                {/* Sub status info below camera */}
                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: '#475569',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        display: 'inline-block',
                      }}
                    />
                    {geoStatus}
                  </span>
                </div>
              </div>
            ) : (
              /* PIN Input View */
              <div style={{ padding: '8px 0 12px' }}>
                <form onSubmit={handlePinSubmit} className="form-stack">
                  <label className="form-label" style={{ textAlign: 'center', fontSize: '14px' }}>
                    관리자가 공지한 현장 PIN 4자리
                  </label>

                  <input
                    type="tel"
                    maxLength={4}
                    autoFocus
                    className="modern-input"
                    style={{
                      fontSize: '32px',
                      letterSpacing: '14px',
                      textAlign: 'center',
                      fontWeight: 800,
                      height: '60px',
                      borderRadius: '14px',
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

                  <p className="form-hint" style={{ textAlign: 'center', fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>
                    * 연습실 반경 내에서만 PIN 출석이 유효합니다.
                  </p>

                  <button
                    type="submit"
                    className="btn-primary-large"
                    disabled={isProcessing || inputPin.length < 4}
                    style={{ marginTop: '12px', minHeight: '48px', fontSize: '15px' }}
                  >
                    {isProcessing ? '위치 검증 및 출석 처리 중...' : '현장 PIN으로 출석 완료'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScannerModal;
