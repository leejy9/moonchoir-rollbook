import React, { useState, useSyncExternalStore } from 'react';
import {
  buildKakaoExternalBrowserUrl,
  detectInstallEnvironment,
  getInstallState,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallState,
} from '../utils/pwaInstall';

interface InstallAppCardProps {
  compact?: boolean;
}

const installStateSnapshot = () => {
  const { canPrompt, installed } = getInstallState();
  return `${canPrompt}:${installed}`;
};

export const InstallAppCard: React.FC<InstallAppCardProps> = ({ compact = false }) => {
  const snapshot = useSyncExternalStore(subscribeInstallState, installStateSnapshot, () => 'false:false');
  const [canPrompt, installed] = snapshot.split(':').map((v) => v === 'true');
  const [showSteps, setShowSteps] = useState(false);
  const [message, setMessage] = useState('');

  const environment = detectInstallEnvironment(
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
    isStandaloneDisplay()
  );

  if (environment === 'STANDALONE' || installed) {
    return null;
  }

  const handleInstall = async () => {
    setMessage('');
    const outcome = await promptInstall();
    if (outcome === 'dismissed') setMessage('설치를 취소했습니다. 필요하면 언제든 다시 누를 수 있어요.');
    if (outcome === 'unavailable') setShowSteps(true);
  };

  const steps =
    environment === 'IOS'
      ? ['Safari 화면 아래(또는 위)의 공유 버튼(□↑)을 누르세요.', '[홈 화면에 추가]를 선택하세요.', '오른쪽 위 [추가]를 누르면 홈 화면에 앱 아이콘이 생깁니다.']
      : environment === 'ANDROID'
        ? ['브라우저 오른쪽 위 메뉴(⋮)를 누르세요.', '[앱 설치] 또는 [홈 화면에 추가]를 선택하세요.']
        : ['주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴에서 [앱 설치]를 선택하세요.'];

  return (
    <section className={`install-app-card ${compact ? 'compact' : ''}`}>
      <div className="install-app-text">
        <strong>📲 앱처럼 설치하기</strong>
        <span>
          {environment === 'KAKAO_INAPP'
            ? '카카오톡 안에서는 설치할 수 없어요. 기본 브라우저로 먼저 열어 주세요.'
            : '홈 화면에 아이콘을 만들어 두면 바로 열 수 있어요.'}
        </span>
      </div>

      {environment === 'KAKAO_INAPP' ? (
        <a
          className="install-app-button"
          href={buildKakaoExternalBrowserUrl(window.location.href)}
        >
          기본 브라우저로 열기
        </a>
      ) : canPrompt ? (
        <button type="button" className="install-app-button" onClick={handleInstall}>
          앱 설치하기
        </button>
      ) : (
        <button type="button" className="install-app-button" onClick={() => setShowSteps((v) => !v)}>
          {showSteps ? '닫기' : '설치 방법 보기'}
        </button>
      )}

      {message && <p className="install-app-note">{message}</p>}

      {showSteps && environment !== 'KAKAO_INAPP' && (
        <ol className="install-app-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </section>
  );
};
