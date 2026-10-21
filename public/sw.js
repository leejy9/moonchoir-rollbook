// 설치 가능 조건 충족용 최소 서비스 워커. 캐시를 하지 않으므로 앱은 항상 최신 배포본을 불러온다(오프라인 미지원).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
