# Moonchoir Rollbook 음원 스트리밍 Cloudflare Worker 설치 안내서

Moonchoir Rollbook 연습실 음원 스트리밍을 제공하는 Cloudflare Worker 배포 절차입니다.
별도의 CLI 도구(`wrangler`) 설치 없이, Cloudflare 웹 대시보드에서 직접 코드를 붙여넣어 3분 안에 배포할 수 있습니다.

---

## 1. 사전 준비: R2 버킷 생성
1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. 좌측 메뉴에서 **R2 Storage**를 선택합니다.
3. **Create bucket** 버튼을 클릭합니다.
4. 버킷 이름을 입력합니다 (예: `moonchoir-media`).
5. 위치(Location)는 가급적 `APAC`(아시아 태평양) 또는 자동(Automatic)으로 두고 **Create Bucket**을 완료합니다.

---

## 2. Cloudflare Worker 생성 및 코드 배포
1. 좌측 메뉴에서 **Compute (Workers & Pages)**를 선택합니다.
2. **Create application** → **Create Worker**를 클릭합니다.
3. Worker 이름을 입력합니다 (예: `moonchoir-media-worker`) 후 **Deploy**를 클릭합니다.
4. 배포 완료 화면에서 **Edit code**를 클릭하여 웹 에디터를 엽니다.
5. 에디터에 기존 코드를 모두 지우고, 이 저장소의 [`workers/media/index.js`](./index.js) 전체 내용을 그대로 복사하여 붙여넣습니다.
6. 우측 상단의 **Deploy** 버튼을 클릭하여 저장 및 배포합니다.

---

## 3. R2 버킷 바인딩 (`MEDIA_BUCKET`) 연결
1. Worker 관리 화면으로 돌아와 **Settings** 탭을 클릭합니다.
2. **Bindings** (또는 **Variables and Secrets**) 섹션으로 이동합니다.
3. **R2 Bucket Bindings** 항목에서 **Add binding**을 클릭합니다.
4. 바인딩 변수 이름(Variable name)에 반드시 다음 이름을 정확히 입력합니다:
   ```text
   MEDIA_BUCKET
   ```
5. 연결할 R2 버킷으로 1단계에서 만든 버킷(예: `moonchoir-media`)을 선택합니다.
6. **Deploy** (또는 **Save and deploy**)를 클릭하여 설정을 저장합니다.

---

## 4. 스트리밍, Range(206), 캐싱(304) 및 에러 검증
R2 버킷에 테스트용 파일(예: `test.m4a`)을 하나 업로드한 뒤, 터미널에서 다음 curl 명령어로 스트리밍과 헤더를 검증합니다:

### 1) Range 구간 요청 (206 Partial Content / 416 Range Not Satisfiable) 검증
1. 앞부분 2바이트 프로브 요청 (iOS Safari 최초 요청):
```bash
curl -sI -H 'Range: bytes=0-1' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 206`, `Content-Range: bytes 0-1/<크기>`

2. 열린 구간 요청 (0바이트부터 끝까지 스트리밍):
```bash
curl -sI -H 'Range: bytes=0-' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 206`, `Content-Range: bytes 0-<크기-1>/<크기>`

3. 끝 구간 요청 (마지막 100바이트):
```bash
curl -sI -H 'Range: bytes=-100' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 206`, `Content-Range: bytes <크기-100>-<크기-1>/<크기>`

4. 범위를 벗어난 잘못된 요청:
```bash
curl -sI -H 'Range: bytes=999999999-' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 416 Range Not Satisfiable`, `Content-Range: bytes */<크기>`

### 2) 전체 Range 요청 예시 및 CORS/Vary 헤더 확인
```bash
curl -I -H "Range: bytes=0-1023" -H "Origin: https://leejy9.github.io" https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답 예시**:
```http
HTTP/2 206
content-type: audio/mp4
etag: "..."
accept-ranges: bytes
content-range: bytes 0-1023/1234567
cache-control: public, max-age=604800, immutable
access-control-allow-origin: https://leejy9.github.io
access-control-expose-headers: Content-Range, Content-Length, ETag, Accept-Ranges
vary: Origin
```

### 3) 조건부 캐시 요청 (304 Not Modified) 확인
위 응답에서 확인한 ETag 값을 전달하여 본문 없는 304 응답이 오는지 확인합니다:
```bash
curl -I -H 'If-None-Match: "<ETag값>"' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 304` (본문 없음, 캐시 헤더 및 ETag 유지)

### 3) 잘못된 URI 인코딩 요청 (400 Bad Request) 확인
잘못된 퍼센트 인코딩 요청 시 500 서버 에러 대신 400 Bad Request가 오는지 확인합니다:
```bash
curl -I https://<내-워커-주소>.workers.dev/%E0%A4%A
```
**정상 응답**: `HTTP/2 400`

---

## 5. 앱 환경설정에 Worker URL 등록
1. 배포된 Worker의 공개 주소(예: `https://moonchoir-media-worker.<계정명>.workers.dev`)를 확인합니다.
2. Moonchoir Rollbook 관리자 콘솔 → **시스템 설정** 탭에서 **음원 스트리밍 기본 주소 (`mediaPublicBaseUrl`)**에 위 URL을 입력하고 저장합니다.
3. 이제 연습실 음원 등록 시 `2026-season/track1.m4a` 같은 파일 키만 등록해도 전체 URL이 자동 조합되어 단원들에게 스트리밍됩니다.
