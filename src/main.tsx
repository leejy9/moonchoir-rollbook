import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initInstallPromptCapture } from './utils/pwaInstall';

initInstallPromptCapture();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.warn('[PWA] service worker registration failed', err));
  });
}

// Global emergency handler if top-level rendering fails
window.addEventListener('error', () => {
  const root = document.getElementById('root');
  if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;background-color:#282C48;color:#ffffff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <div style="font-size:36px;margin-bottom:16px;">🌙</div>
        <h1 style="font-size:18px;margin:0 0 8px 0;">앱 로딩 중 문제가 발생했습니다</h1>
        <p style="font-size:13px;color:rgba(255,255,255,0.7);margin:0 0 20px 0;">최신 업데이트 적용을 위해 새로고침하거나 캐시를 초기화해 주세요.</p>
        <div style="display:flex;gap:10px;">
          <button onclick="window.location.reload()" style="padding:10px 18px;background:#ffffff;color:#282C48;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">🔄 새로고침</button>
          <button onclick="try{localStorage.clear();sessionStorage.clear();}catch(e){}window.location.reload();" style="padding:10px 18px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;font-size:13px;cursor:pointer;">🧹 캐시 초기화</button>
        </div>
      </div>
    `;
  }
});

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
