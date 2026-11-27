import React from 'react';
import { IconCameraOff } from '../Icons';
import { GeoStatusLine } from './GeoStatusLine';
import type { GeoStatusKind } from '../../utils/checkinMessages';
import { buildKakaoExternalBrowserUrl } from '../../utils/pwaInstall';

export interface QrScanPanelProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraError: string | null;
  needsExternalBrowserHint: boolean;
  isKakaoInApp: boolean;
  geoStatusKind: GeoStatusKind;
  geoAccuracyMeters?: number;
}

export const QrScanPanel: React.FC<QrScanPanelProps> = ({
  videoRef,
  cameraError,
  needsExternalBrowserHint,
  isKakaoInApp,
  geoStatusKind,
  geoAccuracyMeters,
}) => {
  return (
    <div className="ci-qr-panel">
      <div className="ci-camera-stage" aria-label="카메라 화면">
        {cameraError ? (
          <div className="ci-camera-fallback">
            <IconCameraOff size={36} className="ci-camera-fallback-icon" />
            <p className="ci-camera-fallback-text">{cameraError}</p>
            {isKakaoInApp && needsExternalBrowserHint && typeof window !== 'undefined' && (
              <a
                href={buildKakaoExternalBrowserUrl(window.location.href)}
                className="ci-external-browser-link"
                target="_blank"
                rel="noreferrer noopener"
              >
                기본 브라우저로 열기
              </a>
            )}
          </div>
        ) : (
          <>
            <video ref={videoRef} className="ci-camera-video" playsInline muted />
            <div className="ci-viewfinder-overlay">
              <div className="ci-viewfinder-box">
                <div className="ci-viewfinder-laser" />
                <span className="ci-corner ci-corner-tl" />
                <span className="ci-corner ci-corner-tr" />
                <span className="ci-corner ci-corner-bl" />
                <span className="ci-corner ci-corner-br" />
              </div>
            </div>
            <div className="ci-camera-hint-bottom">
              현장 QR을 네모 안에 맞춰 주세요
            </div>
          </>
        )}
      </div>

      <GeoStatusLine kind={geoStatusKind} accuracyMeters={geoAccuracyMeters} />

      <p className="ci-qr-fallback-hint">
        카메라가 안 열리거나 QR이 안 보이면 현장 PIN 탭을 눌러 주세요.
      </p>
    </div>
  );
};
