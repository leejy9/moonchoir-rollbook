import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import type { BoundDeviceProfile, RawAttendanceLog, Schedule } from '../types/rollbook';
import { sheetsService } from '../services/sheets';
import { getOrCreateDeviceId } from '../services/auth';
import {
  acquirePosition,
  classifyCameraError,
  describeCameraFailure,
  describeGeoFailure,
  GeoAcquireError,
} from '../utils/geoPosition';
import { calculateDistanceMeters, isWithinRadius } from '../utils/geo';
import { getKSTTimestampString } from '../utils/date';
import { parseQRPayload, findActiveScheduleForMasterQR, playScanSuccessSound } from '../utils/qr';
import { detectInstallEnvironment, isStandaloneDisplay } from '../utils/pwaInstall';
import { useOptionalAudioPlayer } from './audio/audioPlayerContext';
import {
  classifyPinError,
  type CheckInFailureKind,
  type FailureViewContext,
  type GeoStatusKind,
} from '../utils/checkinMessages';
import { nextPinState } from '../utils/pinPad';
import { CheckInHeader } from './checkin/CheckInHeader';
import { QrScanPanel } from './checkin/QrScanPanel';
import { PinPad } from './checkin/PinPad';
import { CheckInResult } from './checkin/CheckInResult';
import '../styles/v3/checkin.css';

interface QRScannerModalProps {
  schedule: Schedule;
  profile: BoundDeviceProfile;
  onClose: () => void;
  onSuccess: (log: RawAttendanceLog) => void;
}

export type CheckInResultState =
  | { kind: 'SUCCESS' }
  | {
      kind: CheckInFailureKind;
      detail: string;
      context?: FailureViewContext;
    };

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  schedule,
  profile,
  onClose,
  onSuccess,
}) => {
  const audioPlayer = useOptionalAudioPlayer();
  const pausedOnceRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pausedOnceRef.current) {
      pausedOnceRef.current = true;
      audioPlayer?.pause();
    }
  }, [audioPlayer]);

  useEffect(() => {
    if (typeof closeButtonRef.current?.focus === 'function') {
      closeButtonRef.current.focus();
    }
  }, []);

  const [activeTab, setActiveTab] = useState<'QR' | 'PIN'>('QR');
  const [inputPin, setInputPin] = useState('');
  const [pinError, setPinError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsExternalBrowserHint, setNeedsExternalBrowserHint] = useState(false);
  const isKakaoInApp =
    typeof navigator !== 'undefined' &&
    detectInstallEnvironment(navigator.userAgent, isStandaloneDisplay()) === 'KAKAO_INAPP';

  const [geoStatus, setGeoStatus] = useState<{ kind: GeoStatusKind; accuracyMeters?: number }>({
    kind: 'idle',
  });
  const [scanResult, setScanResult] = useState<CheckInResultState | null>(null);
  const [savedLog, setSavedLog] = useState<RawAttendanceLog | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    scheduleTitle: string;
    locationName: string;
  } | null>(null);

  const currentMember = sheetsService.getMembers().find((m) => m.id === profile.memberId);
  const currentPart = currentMember?.part || profile.part;
  const currentName = currentMember?.name || profile.name;

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  const handleFinishSuccess = () => {
    if (savedLog) {
      onSuccess(savedLog);
    } else {
      handleClose();
    }
  };

  const handleRetry = () => {
    setScanResult(null);
    setPinError('');
    setGeoStatus({ kind: 'idle' });
  };

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
    let accuracyMeters: number | undefined;
    let isVerifiedLocation = false;

    // Dynamically resolve target GPS coords and radius from location presets
    const locInfo = sheetsService.resolveScheduleLocation(targetSchedule);
    const targetLat = locInfo.targetLat;
    const targetLon = locInfo.targetLon;
    const radiusMeters = locInfo.radiusMeters;
    const venueName = locInfo.locationName;

    const isEmergencyGpsBypassed = sheetsService.isEmergencyGpsBypassed();

    try {
      setGeoStatus({ kind: 'measuring' });
      const position = await acquirePosition();

      lat = position.latitude;
      lon = position.longitude;
      accuracyMeters = position.accuracyMeters;
      distanceMeters = calculateDistanceMeters(lat, lon, targetLat, targetLon);
      isVerifiedLocation = isWithinRadius(lat, lon, targetLat, targetLon, radiusMeters) || isEmergencyGpsBypassed;

      if (isEmergencyGpsBypassed) {
        setGeoStatus({ kind: 'bypass_measured' });
      } else if (isVerifiedLocation) {
        setGeoStatus({
          kind: position.usedFallback ? 'ok_low' : 'ok',
          accuracyMeters,
        });
      }
    } catch (error) {
      if (isEmergencyGpsBypassed) {
        console.warn('[Geo] GPS failed but emergency bypass is active, granting attendance');
        isVerifiedLocation = true;
        setGeoStatus({ kind: 'bypass_skipped' });
      } else {
        console.warn('[Geo] Failed to fetch GPS coordinates', error);
        setNeedsExternalBrowserHint(true);
        setIsProcessing(false);
        setScanResult({
          kind: 'GEO_FAILED',
          detail: error instanceof GeoAcquireError ? error.message : describeGeoFailure('UNKNOWN'),
        });
        return;
      }
    }

    // Strict boundary check for both QR and PIN (skipped when emergency bypass is active)
    if (!isVerifiedLocation && !isEmergencyGpsBypassed) {
      setIsProcessing(false);
      setScanResult({
        kind: 'OUT_OF_RANGE',
        detail: '',
        context: {
          locationName: venueName,
          distanceMeters: distanceMeters ?? 0,
          radiusMeters,
          accuracyMeters,
        },
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
      adminNote: isEmergencyGpsBypassed ? '비상 GPS 면제 출석' : undefined,
      deviceId: getOrCreateDeviceId(),
    };

    try {
      await sheetsService.addCheckInLog(log, checkInPin);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '구글 시트에서 출석 저장을 확인하지 못했습니다.';
      setIsProcessing(false);
      const pinErrKind = classifyPinError(message);
      if (authMethod === 'MANUAL_PIN' && (pinErrKind === 'WRONG' || pinErrKind === 'LOCKED')) {
        setPinError(message);
        setScanResult(null);
        return;
      }
      setScanResult({
        kind: 'SAVE_FAILED',
        detail: message,
      });
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // Haptic vibrate might be restricted
    }
    playScanSuccessSound();

    setSuccessInfo({
      scheduleTitle: targetSchedule.title,
      locationName: venueName,
    });
    setSavedLog(log);
    setIsProcessing(false);
    setScanResult({ kind: 'SUCCESS' });
  };

  // Process QR
  const handleDetectedQRCode = async (rawCode: string) => {
    if (isProcessing) return;
    const parsed = parseQRPayload(rawCode);

    let targetSchedule = schedule;
    if (parsed.type === 'MASTER_WALL_QR') {
      const activeSch = findActiveScheduleForMasterQR(sheetsService.getSchedulesForMember(profile.memberId));
      if (!activeSch) {
        setScanResult({
          kind: 'SAVE_FAILED',
          detail: '현재 출석 가능한 연습 일정이 없습니다.',
        });
        return;
      }
      targetSchedule = activeSch;
    } else if (parsed.type === 'SCHEDULE_SPECIFIC_QR') {
      if (parsed.scheduleId !== schedule.id) {
        setScanResult({
          kind: 'SAVE_FAILED',
          detail: '선택하신 일정과 일치하지 않는 QR 코드입니다.',
        });
        return;
      }
    } else {
      setScanResult({
        kind: 'SAVE_FAILED',
        detail: '유효하지 않은 문콰이어 QR 코드입니다.',
      });
      return;
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
        setCameraError(
          describeCameraFailure(
            classifyCameraError(err, typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia))
          )
        );
        setNeedsExternalBrowserHint(true);
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

    const currentVideoEl = videoRef.current;
    return () => {
      isCancelled = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (currentVideoEl && currentVideoEl.srcObject) {
        const s = currentVideoEl.srcObject as MediaStream;
        if (s && typeof s.getTracks === 'function') {
          s.getTracks().forEach((t) => t.stop());
        }
        currentVideoEl.srcObject = null;
      }
    };
  }, [activeTab, scanResult]);

  const handlePinKey = (key: string) => {
    setInputPin((prev) => {
      const next = nextPinState(
        { pin: prev, errorState: pinError ? classifyPinError(pinError) : null },
        key
      );
      if (next.errorState === null) {
        setPinError('');
      }
      return next.pin;
    });
  };

  const handlePinReset = () => {
    setInputPin('');
    setPinError('');
  };

  const handlePinSubmit = async (pinToSubmit: string) => {
    if (isProcessing) return;
    setPinError('');

    if (pinToSubmit.trim().length < 4) {
      return;
    }

    setIsProcessing(true);
    try {
      await sheetsService.verifyOnSitePin(pinToSubmit);
    } catch (err: unknown) {
      setIsProcessing(false);
      setPinError(
        err instanceof Error
          ? err.message
          : '현장 PIN 확인에 실패했습니다. 인터넷 연결을 확인해주세요.'
      );
      return;
    }

    await executeCheckIn(schedule, 'MANUAL_PIN', pinToSubmit);
  };

  const handleOverlayClick = () => {
    if (scanResult?.kind === 'SUCCESS') {
      handleFinishSuccess();
    } else if (!isProcessing) {
      onClose();
    }
  };

  return (
    <div className="ci-overlay" onClick={handleOverlayClick}>
      <div
        className="ci-modal"
        role="dialog"
        aria-modal="true"
        aria-label="출석 인증"
        onClick={(e) => e.stopPropagation()}
      >
        {scanResult?.kind === 'SUCCESS' && savedLog && successInfo ? (
          <CheckInResult
            type="SUCCESS"
            savedLog={savedLog}
            currentName={currentName}
            successInfo={successInfo}
            onClose={handleFinishSuccess}
          />
        ) : scanResult && scanResult.kind !== 'SUCCESS' ? (
          <CheckInResult
            type="FAILURE"
            kind={scanResult.kind}
            detail={scanResult.detail}
            context={scanResult.context}
            onRetry={handleRetry}
            onClose={onClose}
            needsExternalBrowserHint={needsExternalBrowserHint}
            isKakaoInApp={isKakaoInApp}
          />
        ) : (
          <>
            <CheckInHeader
              schedule={schedule}
              currentName={currentName}
              currentPart={currentPart}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onClose={handleClose}
              isProcessing={isProcessing}
              closeButtonRef={closeButtonRef}
            />

            <div className="ci-body">
              {activeTab === 'QR' ? (
                <QrScanPanel
                  videoRef={videoRef}
                  cameraError={cameraError}
                  needsExternalBrowserHint={needsExternalBrowserHint}
                  isKakaoInApp={isKakaoInApp}
                  geoStatusKind={geoStatus.kind}
                  geoAccuracyMeters={geoStatus.accuracyMeters}
                />
              ) : (
                <PinPad
                  pin={inputPin}
                  pinError={pinError}
                  isProcessing={isProcessing}
                  isActive={activeTab === 'PIN'}
                  geoStatusKind={geoStatus.kind}
                  geoAccuracyMeters={geoStatus.accuracyMeters}
                  onKey={handlePinKey}
                  onReset={handlePinReset}
                  onSubmit={handlePinSubmit}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
