# Moonchoir Rollbook 미디어(음원/악보) Cloudflare Worker 안내서

Moonchoir Rollbook 연습실 음원 스트리밍 및 파일(음원·악보) 업로드/삭제를 처리하는 Cloudflare Worker 설정 안내입니다.
별도의 CLI 도구(`wrangler`) 없이 Cloudflare 대시보드에서 웹 에디터로 직접 배포할 수 있습니다.

---

## 1. 사전 준비: R2 버킷 생성
1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. 좌측 메뉴에서 **R2 Storage**를 선택합니다.
3. **Create bucket** 버튼을 클릭합니다.
4. 버킷 이름을 입력합니다 (예: `moonchoir-media`).
5. 위치(Location)는 가급적 `APAC`(아시아 태평양) 또는 자동(Automatic)으로 두고 **Create Bucket**을 완료합니다.

---

## 2. Cloudflare Worker 생성 및 코드 배포 (재배포 방법)
1. 좌측 메뉴에서 **Compute (Workers & Pages)**를 선택합니다.
2. **Create application** → **Create Worker**를 클릭합니다.
3. Worker 이름을 입력합니다 (예: `moonchoir-media-worker`) 후 **Deploy**를 클릭합니다.
4. 배포 완료 화면(또는 기존 Worker 상세 화면)에서 **Edit code**를 클릭하여 웹 에디터를 엽니다.
5. 에디터의 기존 코드를 지우고, 이 저장소의 [`workers/media/index.js`](./index.js) 파일 전체 내용을 그대로 복사하여 붙여넣습니다.
6. 우측 상단의 **Deploy** 버튼을 클릭하여 저장 및 배포합니다. (코드 갱신 시에도 동일하게 이 에디터에서 붙여넣고 Deploy를 누릅니다.)

---

## 3. R2 버킷 바인딩 (`MEDIA_BUCKET`) 연결
1. Worker 관리 화면에서 **Settings** 탭을 클릭합니다.
2. **Bindings** (또는 **Variables and Secrets**) 섹션으로 이동합니다.
3. **R2 Bucket Bindings** 항목에서 **Add binding**을 클릭합니다.
4. 바인딩 변수 이름(Variable name)에 반드시 다음 이름을 정확히 입력합니다:
   ```text
   MEDIA_BUCKET
   ```
5. 연결할 R2 버킷으로 1단계에서 만든 버킷(예: `moonchoir-media`)을 선택합니다.
6. **Deploy** (또는 **Save and deploy**)를 클릭하여 설정을 저장합니다.

---

## 4. 환경 변수 2개 설정 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
업로드 및 삭제 요청의 관리자 인증을 위해 Supabase RPC(`fn_authorize_media_upload`)를 호출합니다.
1. Worker 상세 페이지의 **Settings** 탭 → **Variables and Secrets** 섹션으로 이동합니다.
2. **Environment Variables** 항목에서 **Add variable**을 클릭합니다:
   - Variable name: `SUPABASE_URL`
   - Value: Supabase 프로젝트 URL (예: `https://xyzcompany.supabase.co`)
3. 한 번 더 **Add variable**을 클릭합니다:
   - Variable name: `SUPABASE_ANON_KEY`
   - Value: Supabase 프로젝트의 anon public key
4. **Deploy** (또는 **Save and deploy**)를 클릭하여 적용합니다.

> [!NOTE]
> `SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 공개 값이지만 저장소 코드에 직접 하드코딩하지 않고 Cloudflare 환경 변수로 주입합니다.
> 클라이언트의 `X-Admin-Token`은 토큰 검증 RPC로만 전달되며 로그에 남기지 않습니다.

---

## 5. 허용 형식 및 파일 크기 제한

| 구분 (`kind`) | 허용 Content-Type | 확장자 | 최대 크기 | R2 키 규칙 |
|---|---|---|---|---|
| `audio` (음원) | `audio/mp4`, `audio/x-m4a`, `audio/mpeg`, `audio/aac` | `.m4a`, `.mp3`, `.aac` | 30MB | `{YYYY}/audio/{16자소문자영숫자}.{ext}` |
| `score` (악보) | `application/pdf` | `.pdf` | 20MB | `{YYYY}/score/{16자소문자영숫자}.pdf` |

- `POST /upload?kind=audio|score`
  - 필수 헤더: `X-Admin-Token`, `Content-Length`, `Content-Type`
  - 응답: 201 Created `{"key": "...", "size": ...}`
  - 인증 실패: 401, 형식 불일치: 415, 크기 초과: 413, 헤더 누락: 411
- `DELETE /object/{key}`
  - 필수 헤더: `X-Admin-Token`
  - 키가 `^\d{4}/(audio|score)/[a-z0-9]{16}\.(m4a|mp3|aac|pdf)$`에 맞을 때만 삭제
  - 응답: 204 No Content

---

## 6. 스트리밍, Range(206), 캐싱(304) 및 에러 검증
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
```bash
curl -I -H 'If-None-Match: "<ETag값>"' https://<내-워커-주소>.workers.dev/test.m4a
```
**정상 응답**: `HTTP/2 304` (본문 없음, 캐시 헤더 및 ETag 유지)

---

## 7. 앱 환경설정에 Worker URL 등록
1. 배포된 Worker의 공개 주소(예: `https://moonchoir-media-worker.<계정명>.workers.dev`)를 확인합니다.
2. Moonchoir Rollbook 관리자 콘솔 → **시스템 설정** 탭에서 **음원 스트리밍 기본 주소 (`mediaPublicBaseUrl`)**에 위 URL을 입력하고 저장합니다.
3. 이제 연습실 음원/악보 등록 시 `2026/audio/abc...m4a` 같은 R2 키만 저장되어 단원 앱에 전달됩니다.
