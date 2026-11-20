# Moonchoir Rollbook — 2단계 관리자 시스템(Two-Tier Admin) & 이스터에그(Get in) 구축 개발 계획서

> **문서 파일명**: `1120_admin.md` (동일 사본: `docs/plans/1120_admin.md`)  
> **작성일**: 2026-11-20  
> **상태**: 구현 승인 대기 (다른 PC 또는 에이전트 독립 실행 가능 완전 자립형 계획서)  
> **관련 문서**: [AGENTS.md](AGENTS.md) · [구조 복구 기록](docs/ARCHITECTURE_RECOVERY.md) · [DEV_LOG.md](docs/DEV_LOG.md)

---

## 0. 한 줄 요약 & 기획 의도

문콰이어 출석부의 관리자 권한을 **[1. 일반 운영진 관리자(Staff Admin)]**와 **[2. 최고 시스템 관리자(Super Admin)]**로 2단계 분리(Two-Tier RBAC)한다.  
- **일반 운영진(PIN: `1004`, ⚙️ 톱니바퀴 진입)**: 실수로 시스템 설정을 건드리지 않도록 위험한 구글 시트 URL 입력 및 시스템 설정 탭을 제거하고, 대신 매주 연습에 필수적인 **출결 통계 대시보드(`AdminStatsTab`)를 고도화하여 전면에 배치**한다.
- **최고 관리자(PIN: `2315`, 이스터에그 진입)**: 브랜드 로고의 **우클릭(PC) / 트리플 탭(모바일 3연타) 제스처**를 통해 미니 팝오버 메뉴 `[ 🔒 Get in ]`을 노출하고, **단원별 원천 감사 로그(출결/댓글/RSVP/접속·열람 이력 등) 조회**, **구글 시트 연동 Webhook URL 설정**, **PIN 번호(1004, 현장 PIN, 2315) 통합 관리**를 전담한다.

---

## 1. 현재 구조 사실 확인 (As-Is) & 트러블슈팅 분석

### 1.1 이전 로고 롱프레스 이스터에그가 실패했던 근본 원인
| 번호 | 원인 구분 | 코드 및 환경 근거 | 실제 사용자 경험 문제 |
| :--- | :--- | :--- | :--- |
| **1** | **연결 기능 불일치** | `src/components/HomeView.tsx` L76~79:<br>`onLongPress: () => setShowPinResetModal(true)` | 로고를 눌렀을 때 관리자 페이지로 '들어가는' 것이 아니라 비밀번호를 바꾸는 `AdminPinResetModal`이 열렸음. |
| **2** | **3초 롱프레스 마찰** | `src/hooks/useLongPress.ts` L10:<br>`thresholdMs = 3000` | 모바일 환경에서 3초(3,000ms)는 너무 긴 시간이며, 손가락이 1mm만 떨려도 브라우저 스크롤 이벤트로 인식되어 터치가 취소되거나 iOS Safari/Chrome의 '이미지 복사/저장' 팝업이 가로막음. |
| **3** | **비밀번호 불일치** | Supabase DB `app_secrets`의 `adminPin` | 구글 시트에서 초기 마이그레이션된 값이 `1004`였기 때문에, 사용자가 `2315`를 입력해도 "일치하지 않습니다" 오류 발생. |

### 1.2 현재 일반 관리자 페이지(`AdminDashboard.tsx`)의 구조적 결함
- **위험한 설정 노출**: 파트장, 총무진 등 일반 운영진이 들어가는 화면에 `AdminSettingsTab`(구글 시트 Web App URL 입력, 클라우드 동기화 덮어쓰기 등)이 노출되어 있어, 실수로 URL을 수정하거나 백엔드 설정을 망가뜨릴 위험이 상존함.
- **통계 대시보드 미활용**: 기간별(1·3·6개월, 전체), 파트별 출석률 액체 게이지(`LiquidGauge`)가 구현된 `AdminStatsTab.tsx` 컴포넌트가 존재함에도 불구하고 `AdminDashboard.tsx` 상단 탭에서 누락되어 운영진이 활용하지 못하고 있음.

---

## 2. 목표 아키텍처 (To-Be Architecture)

```
[ 일반 단원 홈 화면 (HomeView) ]
    │
    ├─ (우측 상단 ⚙️ 아이콘 클릭) ─────────────────► PIN 모달 (1004 입력) 
    │                                                     │
    │                                                     ▼
    │                                          [ 1. 일반 운영진 관리자 화면 (AdminDashboard) ]
    │                                          • 탭 1: 단원 명부 & 현장 출결 (ROSTER)
    │                                          • 탭 2: 연습 일정 & 캘린더 (SCHEDULES)
    │                                          • 탭 3: 🌟 출결 통계 대시보드 (STATS, 신규 통합)
    │                                          (※ 위험한 시스템 설정 탭은 영구 제거)
    │
    └─ (로고 우클릭[PC] / 3연타[모바일] 이스터에그) ──► 미니 팝오버 [ 🔒 Get in ] 클릭 
                                                              │
                                                              ▼
                                                        PIN 모달 (2315 입력)
                                                              │
                                                              ▼
                                               [ 2. 최고 시스템 관리자 화면 (SuperAdminDashboard) ]
                                               • 탭 1: 🔍 단원별 원천 감사 로그 (AUDIT_LOGS)
                                                 (출결 로그, 댓글 수정/삭제 이력, RSVP 로그, 접속/기기 기록)
                                               • 탭 2: ☁️ 클라우드 & 시트 연동 제어 (CLOUD_INTEGRATION)
                                                 (구글 시트 Webhook URL, 실시간 소켓 헬스체크, 수동 백업)
                                               • 탭 3: 🔐 보안 자격 증명 관리 (SECURITY)
                                                 (운영진 PIN 1004, 현장 출석 PIN, 슈퍼 PIN 2315 관리)
```

---

## 3. 도메인 불변식 및 경계선 (Invariants & Boundaries)

1. **Append-Only Event Sourcing 불변식 (`GEMINI.md` / `AGENTS.md`)**:
   - `attendance_logs`, `schedule_comment_events`, `rsvp_votes` 등 원천 로그는 최고 관리자 화면에서도 물리 삭제(DELETE)하거나 덮어쓰기(In-place update)할 수 없다. 오직 조회 및 취소 이벤트 추가(Append)만 가능하다.
2. **모바일 터치 타깃 44px 이상 유지**:
   - 로고 이스터에그 팝오버, 미니 메뉴, 탭 전환 버튼, 입력 필드는 모바일 현장에서 한 손 조작이 가능하도록 최소 44px 이상의 터치 타깃을 보장한다.
3. **스키마 하위 호환성 유지**:
   - Supabase DB 및 로컬 스토리지 키의 기존 필드를 삭제하지 않으며, 새 속성은 기본값을 제공하는 어댑터를 통해 로드한다.
4. **Do Not Touch**:
   - `src/services/auth.ts`의 단원 기기 바인딩 로직(`bindDeviceProfile`, `getBoundDeviceProfile`).
   - `src/services/backend/supabaseBackend.ts`의 기본 RPC 호출 규약.

---

## 4. 세부 기술 사양 및 컴포넌트 설계

### 4.1 인증 & 세션 분리 (`src/services/auth.ts`)
기존 단일 관리자 세션을 **일반 관리자 세션**과 **최고 관리자 세션**으로 분리하고 독립적인 15분 유휴 타임아웃을 적용한다.

```typescript
const AUTH_KEYS = {
  DEVICE_PROFILE: 'moonchoir_bound_device_v1',
  ADMIN_SESSION: 'moonchoir_admin_session_v1',
  SUPER_ADMIN_SESSION: 'moonchoir_super_admin_session_v1', // 신규
};
const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// 일반 관리자 세션 함수 (기존 유지)
export function isAdminLoggedIn(): boolean;
export function setAdminLoggedIn(loggedIn: boolean): void;

// 최고 관리자 세션 함수 (신규 추가)
export function isSuperAdminLoggedIn(): boolean;
export function setSuperAdminLoggedIn(loggedIn: boolean): void;
```

### 4.2 Supabase DB 및 RPC 함수 명세
1. **자격 증명 키 보관 (`app_secrets`)**:
   - `adminPin`: `'1004'` (일반 운영진 PIN)
   - `superAdminPin`: `'2315'` (최고 관리자 PIN)
2. **RPC 함수 (`supabase/migrations/` 및 Supabase SQL)**:
   - `fn_verify_admin_pin(p_pin text)`: `app_secrets`의 `adminPin`과 대조 (기존 유지, `1004`)
   - `fn_verify_super_admin_pin(p_pin text)` (신규):
     ```sql
     create or replace function fn_verify_super_admin_pin(p_pin text)
     returns jsonb security definer language plpgsql as $$
     declare
       v_real_pin text;
     begin
       select value into v_real_pin from app_secrets where key = 'superAdminPin';
       if v_real_pin is null then
         -- Fallback 기본값 2315
         v_real_pin := '2315';
       end if;
       if trim(p_pin) = trim(v_real_pin) then
         return jsonb_build_object('success', true, 'message', '최고 관리자 인증 성공');
       else
         return jsonb_build_object('success', false, 'message', '최고 관리자 PIN 번호가 일치하지 않습니다.');
       end if;
     end;
     $$;
     grant execute on function fn_verify_super_admin_pin to anon, authenticated;
     ```
   - `fn_save_config(p_payload jsonb)`:
     - `v_key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin')`으로 `superAdminPin`도 `app_secrets`로 라우팅되도록 수정.

### 4.3 로고 이스터에그 및 "Get in" 미니 팝오버 UI (`src/components/HomeView.tsx`)
- **이벤트 바인딩**:
  1. **PC (마우스 우클릭)**:
     - `onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowEasterEgg(true); }}`
  2. **모바일 (트리플 탭 - 3연타 제스처)**:
     - 마지막 탭 시각 기록(`lastTapRef`). 400ms 이내에 3번 연속 터치 시 발동:
       ```typescript
       const handleLogoTouch = () => {
         const now = Date.now();
         if (now - lastTapTime.current < 400) {
           tapCount.current += 1;
           if (tapCount.current >= 3) {
             tapCount.current = 0;
             if (navigator.vibrate) navigator.vibrate(100);
             setShowEasterEgg(true);
           }
         } else {
           tapCount.current = 1;
         }
         lastTapTime.current = now;
       };
       ```
  3. **모바일 (보조: 0.6초 롱터치)**:
     - 600ms 이상 길게 누를 경우에도 햅틱 진동과 함께 발동 (`thresholdMs: 600`).
- **미니 팝오버 UI 디자인 (`EasterEggMenu`)**:
  - 로고 바로 아래에 플로팅되는 작고 미려한 블랙 글래스모피즘(Dark Frosted Glass) 카드:
    ```html
    <div className="easter-egg-popover">
      <button className="easter-egg-item" onClick={handleOpenSuperAdmin}>
        <span className="easter-egg-icon">🔒</span>
        <span className="easter-egg-label">Get in</span>
        <span className="easter-egg-badge">Master</span>
      </button>
    </div>
    ```

### 4.4 일반 운영진 화면 개편 (`src/components/AdminDashboard.tsx`)
- **상단 탭 바 변경**:
  - 기존: `ROSTER` | `SCHEDULES` | `SETTINGS`
  - **개선 후**: `ROSTER`(단원 출결) | `SCHEDULES`(일정 캘린더) | `STATS`(출결 통계 대시보드)
- **통계 대시보드 탭 통합 (`AdminStatsTab.tsx`)**:
  - `useAttendanceAdmin` 훅에서 계산되는 `cumulativeSessions`, `filteredSummaries`, `selectedAvgRate`, 기간별 필터 옵션(`1M`, `3M`, `6M`, `THIS_YEAR`, `ALL`)을 `AdminStatsTab`에 완벽히 연결하여 전면 렌더링.
- **위험한 설정 탭 분리**:
  - `AdminSettingsTab`은 `AdminDashboard`에서 완전히 제거하여 최고 관리자 전용 화면으로 이관.

### 4.5 최고 관리자 화면 신설 (`src/components/admin/SuperAdminDashboard.tsx`)
최고 시스템 관리자만 접근할 수 있는 전용 대시보드 컴포넌트를 구축한다.
- **헤더**:
  - 최고 관리자 전용 뱃지 (`[최고 시스템 관리자 / Super Admin]`)
  - `[홈으로 복귀]` 및 `[로그아웃]` 버튼
- **3대 탭 구성**:
  1. **탭 1: 단원 활동 & 원천 감사 로그 (`AUDIT_LOGS`)**:
     - **출결 원천 로그**: 타임스탬프, 인증수단(QR / PIN / 수동), GPS 거리(m) 검증 여부, 관리자 노트, 취소 로그 열람.
     - **댓글 원천 로그**: 단원명, 파트, 액션(`CREATE` / `EDIT` / `DELETE`), 작성 원문, KST 타임스탬프, 디바이스 ID.
     - **사전투표(RSVP) 이력**: 단원별 참석/불참/미투표 변경 이력 및 정확한 제출 시각.
     - **단원별 접속/기기 정보**: 단원명, 바인딩된 기기 ID(`deviceId`), 최초 바인딩 일시, 최종 활동 시각.
  2. **탭 2: 클라우드 & 시트 연동 제어 (`CLOUD_INTEGRATION`)**:
     - Supabase 실시간 WebSocket 채널(7개 테이블) 연결 상태 및 헬스체크 상태 표시.
     - Google Sheets Web App URL 설정 입력 필드 및 즉시 연결 테스트.
     - 원클릭 수동 전체 백업 내보내기 / 스냅샷 강제 동기화 버튼.
     - 캐시 비상 초기화 버튼.
  3. **탭 3: 보안 & 자격 증명 관리 (`SECURITY`)**:
     - **일반 운영진 관리자 PIN** (현재: `1004`): 조회 및 새 PIN으로 즉시 변경 기능.
     - **현장 출석 PIN**: 오늘 연습용 4자리 현장 PIN 조회 및 수동 갱신 기능.
     - **최고 관리자 PIN** (현재: `2315`): 최고 관리자 PIN 번호 자체 변경 기능.

### 4.6 루트 앱 라우팅 통합 (`src/App.tsx`)
- `currentView` 타입 확장: `'HOME' | 'CALENDAR' | 'ADMIN' | 'SUPER_ADMIN'`
- 최고 관리자 인증 처리:
  - `showSuperAdminPinModal` 상태 추가.
  - `handleOpenSuperAdmin`: `isSuperAdminLoggedIn()` 검사 → 미인증 시 모달 오픈 → `2315` 검증 성공 시 `setCurrentView('SUPER_ADMIN')`.

---

## 5. 단계별 실행 계획 (Implementation Recipe)

### Phase 1: DB & RPC 마이그레이션
1. `supabase/migrations/20261120000000_super_admin.sql` 생성:
   - `superAdminPin`을 `app_secrets`에 삽입 (기본값: `'2315'`).
   - `fn_verify_super_admin_pin(p_pin text)` RPC 함수 선언 및 실행 권한 부여.
   - `fn_save_config`에 `superAdminPin` 라우팅 추가.
2. `supabase/all_in_one_setup.sql` 최신화 동기화.

### Phase 2: 서비스 계층(Backend & Auth) 확장
1. `src/services/auth.ts`:
   - `isSuperAdminLoggedIn`, `setSuperAdminLoggedIn`, `touchSuperAdminSession` 구현.
2. `src/services/backend/types.ts`:
   - `RemoteBackend` 인터페이스에 `verifySuperAdminPin(pin: string): Promise<boolean>` 또는 액션 추가.
3. `src/services/backend/supabaseBackend.ts`:
   - `VERIFY_SUPER_ADMIN_PIN` 액션을 `fn_verify_super_admin_pin` RPC로 매핑.
4. `src/services/sheets.ts`:
   - `verifySuperAdminPin(pin: string)` 메서드 신설.

### Phase 3: HomeView 이스터에그 및 "Get in" 팝오버 구현
1. `src/components/HomeView.tsx`:
   - 로고 이미지에 우클릭 핸들러(`onContextMenu`) 및 모바일 3연타/0.6초 제스처 바인딩.
   - 바깥 영역 터치/클릭 시 닫히는 `EasterEggMenu` 팝오버 컴포넌트 마운트.
   - `Get in` 클릭 시 `onOpenSuperAdmin()` 호출.

### Phase 4: 일반 운영진 화면 개편 (`AdminDashboard.tsx`)
1. `AdminDashboard.tsx`:
   - 탭 정의를 `'ROSTER' | 'SCHEDULES' | 'STATS'`로 변경.
   - `SETTINGS` 탭 및 `AdminSettingsTab` import 제거.
   - `AdminStatsTab`을 상단 탭 바로 마운트하고 `useAttendanceAdmin`과 연결.

### Phase 5: 최고 관리자 화면 구축 (`SuperAdminDashboard.tsx`)
1. `src/components/admin/SuperAdminDashboard.tsx` 신설:
   - 탭 1: `AuditLogsTab.tsx` (출결 로그, 댓글 로그, 투표 로그, 기기 접속 정보 테이블 뷰).
   - 탭 2: `CloudIntegrationTab.tsx` (`AdminSettingsTab`의 시트 연동 및 웹소켓 헬스체크 이관).
   - 탭 3: `SecurityCredentialsTab.tsx` (1004 운영진 PIN, 현장 PIN, 2315 최고 관리자 PIN 변경).

### Phase 6: 앱 쉘 연동 & 통합 테스트
1. `src/App.tsx`:
   - `SUPER_ADMIN` 뷰 렌더링 및 `AdminPinModal`의 최고 관리자 모드 지원(`isSuperAdminMode`).
2. 단위 및 회귀 테스트:
   - `auth.test.ts`: 최고 관리자 세션 분리 및 만료 테스트.
   - `sheets.test.ts`: `verifySuperAdminPin` 검증 테스트.
   - `AdminDashboard.test.tsx`: 일반 관리자 화면에 `STATS` 탭 렌더링 및 `SETTINGS` 탭 부재 검증.
   - `SuperAdminDashboard.test.tsx`: 감사 로그, 시트 설정, PIN 변경 뷰 렌더링 검증.

---

## 6. 결정론적 검증 시나리오 (WHEN ... THEN ...)

1. **SCENARIO 1: 일반 운영진 진입 및 대시보드 통계 열람**
   - **WHEN**: 홈 화면 우측 상단의 톱니바퀴(⚙️) 아이콘을 클릭하고 PIN `1004`를 입력하면,
   - **THEN**: 일반 관리자 화면(`AdminDashboard`)이 열리고, 상단 탭에 `ROSTER`, `SCHEDULES`, `STATS`가 나타나며, `STATS` 클릭 시 기간별/파트별 출석률 액체 게이지와 랭킹이 정상 렌더링된다. (위험한 시트 설정 탭은 보이지 않아야 함)

2. **SCENARIO 2: PC 환경 로고 우클릭 이스터에그 진입**
   - **WHEN**: PC 브라우저에서 브랜드 로고 이미지를 마우스 우클릭하면,
   - **THEN**: 브라우저 기본 컨텍스트 메뉴가 차단되고, 로고 바로 아래에 `[ 🔒 Get in ]` 미니 팝오버가 나타난다.
   - **WHEN**: `[ 🔒 Get in ]`을 클릭하고 PIN `2315`를 입력하면,
   - **THEN**: 최고 관리자 화면(`SuperAdminDashboard`)으로 즉시 진입한다.

3. **SCENARIO 3: 모바일 스마트폰 로고 제스처 이스터에그 진입**
   - **WHEN**: 스마트폰 모바일 화면에서 브랜드 로고를 400ms 이내에 톡-톡-톡 3번 연속 터치하거나 0.6초간 길게 누르면,
   - **THEN**: 100ms 햅틱 진동과 함께 `[ 🔒 Get in ]` 미니 팝오버가 렌더링되고, `2315` 입력 시 최고 관리자 화면으로 진입한다.

4. **SCENARIO 4: 최고 관리자 화면에서 원천 감사 로그 열람**
   - **WHEN**: 최고 관리자 화면의 `AUDIT_LOGS` 탭에 진입하면,
   - **THEN**: 모든 단원의 출결 원천 로그(인증수단, 시각, 관리자 수동 취소 이력), 댓글 작성/수정/삭제 이벤트 로그, 기기 바인딩 ID가 상세 테이블로 정확히 표시된다.

5. **SCENARIO 5: 잘못된 PIN 입력 시 차단**
   - **WHEN**: 일반 관리자 PIN에 `2315`를 입력하거나, 최고 관리자 PIN에 `1004`를 입력하면,
   - **THEN**: "PIN 번호가 일치하지 않습니다" 에러 배너가 노출되고 진입이 철저히 차단된다.

6. **SCENARIO 6: 최종 시스템 센서 (Green Bar)**
   - **WHEN**: 모든 구현 후 CLI 검증 명령어를 실행하면,
   - **THEN**: 
     - `npm run typecheck`: 0 Errors (Exit code 0)
     - `npm run lint`: 0 Errors, 0 Warnings
     - `npm test`: 전체 52개 이상 테스트 파일 100% PASS (Green Bar)
     - `npm run build`: 프로덕션 번들 정상 생성
