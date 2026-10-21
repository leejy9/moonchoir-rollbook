export type InstallEnvironment =
  | 'STANDALONE'
  | 'KAKAO_INAPP'
  | 'IOS'
  | 'ANDROID'
  | 'OTHER';

export function detectInstallEnvironment(userAgent: string, isStandalone: boolean): InstallEnvironment {
  if (isStandalone) return 'STANDALONE';
  // 카카오톡 인앱 브라우저는 홈 화면 추가/설치를 지원하지 않는다.
  if (/KAKAOTALK/i.test(userAgent)) return 'KAKAO_INAPP';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'IOS';
  if (/Android/i.test(userAgent)) return 'ANDROID';
  return 'OTHER';
}

export function buildKakaoExternalBrowserUrl(pageUrl: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(pageUrl)}`;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** 앱 시작 시 한 번 호출해 beforeinstallprompt를 놓치지 않도록 미리 잡아 둔다. */
export function initInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function subscribeInstallState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState(): { canPrompt: boolean; installed: boolean } {
  return { canPrompt: deferredPrompt !== null, installed };
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
