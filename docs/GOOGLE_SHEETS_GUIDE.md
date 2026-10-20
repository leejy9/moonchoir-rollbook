# 📊 문콰이어 출석부 — 구글 스프레드시트 3분 연동 가이드

문콰이어 출석부는 구글 스프레드시트를 **단일 진실 공급원(SSOT)**으로 사용합니다.  
서버 비용이나 복잡한 데이터베이스 설정 없이 구글 계정만 있으면 즉시 무료로 영구 운영할 수 있습니다.

---

## 🚀 3분 연동 순서 요약

```
[구글 시트 생성] ➔ [Apps Script 복사] ➔ [setup 함수 1회 실행] ➔ [웹 앱 배포] ➔ [URL 대시보드 등록]
```

---

### Step 1. 구글 스프레드시트 생성
1. [Google 스프레드시트](https://sheets.new)에 접속하여 새 시트를 생성합니다.
2. 시트 제목을 자유롭게 입력합니다. (예: `문콰이어 2026 출석부 및 일정`)

---

### Step 2. Apps Script 편집기 열기 및 코드 붙여넣기
1. 상단 메뉴에서 **[확장 프로그램] ➔ [Apps Script]**를 클릭합니다.
2. 기본으로 적혀있는 `function myFunction() {}` 코드를 **모두 지웁니다.**
3. 프로젝트 루트의 [`google-apps-script.js`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/google-apps-script.js) (또는 동일 사본인 [`docs/google_apps_script.js`](file:///Users/grasshop/Desktop/Antigravity/Moonchoir_rollbook/docs/google_apps_script.js)) 파일의 **전체 내용을 복사하여 붙여넣습니다.** *(과거 5대 탭 구버전 `gas/Code.gs`는 폐기되었습니다.)*
4. 상단 디스켓 아이콘(저장) 또는 `Ctrl + S` (`Cmd + S`)를 눌러 저장합니다.

---

### Step 3. 8대 탭 자동 초기화 (`seedInitialData` 또는 첫 동기화 실행)
1. 상단 툴바의 실행 함수 선택 드롭다운에서 **`seedInitialData`** (또는 `doGet`)를 선택하고 **[▶ 실행]** 버튼을 클릭합니다.
2. 최초 1회 실행 시 **"승인 필요"** 팝업이 뜹니다:
   - [권한 검토] 클릭 ➔ 자신의 구글 계정 선택
   - "Google에서 확인하지 않은 앱" 경고가 뜨면 좌측 하단의 **[고급]** 클릭 ➔ **[프로젝트 제목(안전하지 않음)으로 이동]** 클릭
   - [허용] 클릭
3. 구글 시트로 돌아가 보면 아래 **8대 공식 한글 탭**이 헤더 키 기반으로 자동 생성됩니다:
   - **`단원명부`**: 단원 마스터 명부 (`id`, `name`, `part`, `phoneLast4`, `phone`, `role`, `status`, `joinedAt`, `memberStatus`, `note`, `boundDeviceId`, `boundDeviceAt`, `mergedIntoId`)
   - **`일정캘린더`**: 연습 및 연주 일정 (`id`, `title`, `date`, `startTime`, `endTime`, `locationName`, `category`, `programId`, `seriesId`, `targetAudienceType`, `targetParts`, `targetMemberIds`, `checkInPin`, `description`, `isArchived`, `locationId`, `latitude`, `longitude`, `radiusMeters`, `isCancelled`)
   - **`사전투표_RSVP`**: 사전 참석/불참 현재 응답 (1인 1투표 Upsert, 연습 1시간 전 마감)
   - **`출석원천로그`**: 원천 출석 체크 타임스탬프 로그 (Append-Only 불변 보존, `log.id` 멱등성 보장)
   - **`장소정보`**: 연습실 주소, 상세주소, 오시는 길, GPS 위경도 및 인정 반경 프리셋
   - **`단원변경로그`**: 단원 상태/파트 생애주기 변경 감사 로그 (Append-Only)
   - **`일정카드`**: 학기/프로젝트 단위 상위 일정 묶음 컨테이너 (`ProgramCard`)
   - **`환경설정`**: 지각 유예시간, 관리자 PIN, 동적 파트/상태/카테고리 분류 체계, QR 인쇄 서식

---

### Step 4. 웹 앱(Web App)으로 배포
1. Apps Script 우측 상단의 파란색 **[배포] ➔ [새 배포]**를 클릭합니다.
2. 톱니바퀴 아이콘 [유형 선택] ➔ **[웹 앱]**을 선택합니다.
3. 배포 설정을 아래와 같이 입력합니다:
   - **설명**: `문콰이어 출석부 API v1`
   - **다음 사용자 권한으로 실행**: `나 (your_email@gmail.com)`
   - **액세스 권한**: **`모든 사용자` (Anyone)**  
     *(⚠️ 중요: 합창단원들이 구글 로그인 없이 스마트폰 웹에서 즉시 출석 체크 및 투표를 전송할 수 있도록 반드시 '모든 사용자'로 설정해야 합니다.)*
4. 하단의 **[배포]** 버튼을 클릭합니다.
5. 배포 완료 창에서 생성된 **[웹 앱 URL]**을 복사합니다.  
   *(형식: `https://script.google.com/macros/s/AKfycb.../exec`)*

---

### Step 5. 문콰이어 관리자 대시보드에 URL 등록
1. 문콰이어 웹 앱에 접속합니다.
2. 우측 상단의 **[⚙️ 관리자]** 버튼을 누르고 관리자 PIN(`1234`)을 입력합니다.
3. **[⚙️ 구글 시트 연동 설정]** 탭으로 이동합니다.
4. `Google Apps Script Web App URL` 입력란에 Step 4에서 복사한 URL을 붙여넣고 **[설정 저장]** 및 **[동기화]**를 누릅니다.
5. 이제 모든 대원의 출석 체크, 사전 투표, 신규 대원 등록, 수동 출석 인정 감사 로그가 **구글 시트에 실시간으로 기록**됩니다!

---

## 🔒 데이터 보안 및 도메인 원칙
1. **Append-Only 원천 보존**:
   - 현장 QR 체크인 및 관리자 수동 보정은 `Attendance_Logs` 시트에 순차적으로 쌓이기만 하며, 과거의 기록을 임의로 덮어쓰거나 지우지 않습니다.
2. **동적 파트 및 예외 입력 보존**:
   - 소프라노, 알토, 테너, 베이스 외에 "선생님", "객원", "기타 파트" 등 새로운 구분이나 사유가 입력되어도 스키마가 깨지지 않고 그대로 저장됩니다.
3. **오프라인/로컬 캐시 안전망**:
   - 구글 시트 URL을 아직 등록하지 않았거나 통신 장애가 발생하더라도 스마트폰 브라우저 로컬 저장소에서 100% 정상 작동하며 데이터가 유실되지 않습니다.
