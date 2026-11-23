# V3 출시 전 안정성 후속 개선 계획

> 관련 기준: [V3 명세](../MEMBER_UX_V3_SPEC.md), [V3 구현 지시서](./17_v3_implementation_guide.md)
> 검토 기준 브랜치: `feat/v3-activity-2`, HEAD `0e6947e` (`origin/feat/v3-activity-2`와 동일)
> 상태: READY-01~04 구현 완료. READY-05는 전역 동기화 확인은 했으나 활동 RPC 404와 새 HEAD CI가 남아 차단 상태.

## 0. 목적과 검토 근거

**무엇을, 왜:** 최근 내 활동·플레이어 UI 검토에서 발견한 설치 상태별 빈 메뉴 행, YouTube 오류 복구, 팝업 키보드 접근성, 열정 온도 기준점 표시를 정리하고, 출시 전 실제 동기화·CI 확인 절차를 명시한다.

- 현재 작업 트리의 변경은 `0e6947e` 위에 미커밋 상태다. PR #46은 `feat/v3-profile`을 대상으로 열려 있다. 현재 초록인 원격 CI는 미커밋 변경을 포함하지 않는다.
- 최초 브라우저 확인 때는 요청 실패와 동기화 실패 표시가 있었다. 이후 페이지의 동기화 재시도는 성공으로 바뀌었지만, 실제 활동 RPC는 아래 §5와 같이 404를 반환했다. 최초 실패 원인은 미확인이다.
- 현재 코드 변경에는 `supabase/` 파일이나 DB 스키마 변경이 없다. 이 계획도 DB 변경을 추가하지 않는다.
- 브라우저에서 375px 화면의 문서 폭은 375px로 측정됐다. 과다 콘텐츠가 있는 세로 flex 레이아웃에서 영상 영역 높이가 0px로 줄어드는 현상을 재현했고, 현재 CSS 수정 뒤 재현 레이아웃에서는 약 201px 높이로 유지됐다. 이 재현은 자동 회귀 테스트가 아니므로 실제 플레이어 화면 확인을 별도로 둔다.
- 열정 온도 표시 계산은 코드상 `34.0~42.0` 범위에 `result.value`를 선형 매핑한다. 36.5°C는 31.25%이고 고정 눈금도 31.25%다. 따라서 수식만 보면 기준점은 일치한다. 사용자가 본 어긋남은 현재 기준 데이터로 재현·측정하지 못했으므로, 수식이나 온도 계산을 임의 변경하지 않고 화면 좌표를 먼저 측정한다.
- 계획 문서 작성 당시에는 `npm run typecheck`만 실행했다. 구현 후 Green Bar 및 브라우저 검증은 §5에 기록한다.

### 데이터·화면 경로

- 온도 표시: 기존 `ProfileTab`의 회원·일정·출석 로그·활동 입력 → `computePassionTemperature` → `PassionTemperatureResult.value`(숫자 °C) → `ProfilePassionTempCard`의 범위 백분율 → 채움 막대·36.5°C 눈금·현재값 표시.
- 설치 메뉴: 브라우저 설치 상태 → `InstallAppCard`의 표시 여부(`null` 가능) → `ProfileSettingsSection` 메뉴 행.
- 영상: `ActiveVideoState.track.url` → `VideoStage`의 YouTube ID 및 플레이어 상태 → 16:9 영상 영역 또는 해당 영상 외부 링크 fallback.
- 스티커 팝업: `ProfileStickersPreviewCard.onOpen` → `ProfileTab`의 보드 열기 → `StickerBoardSheet.onClose`(닫을 때 기존 획득 목록을 본 목록으로 표시).

## 1. 기존 코드 계약 — 이번 세션에서 직접 확인

| 이름 | 정의 위치 | 받는 것 / 돌려주는 것 | 빠뜨리면 생기는 일 | 대신 쓸 것 |
|---|---|---|---|---|
| `ProfileTab` | `src/components/ProfileTab.tsx:40` | `profile`, 표시 설정 값·콜백, 단원 변경, 선택적 로그아웃/일정 콜백, refresh trigger를 받아 내 활동 데이터·설정·팝업을 조립 | 기존 조립 흐름을 우회하면 설정 저장·닫기 시 스티커 읽음 처리 연결이 끊길 수 있음 | 새 설정/스티커 데이터 판정을 만들지 말고 이 조립 컴포넌트 유지 |
| `ProfileSettingsSection` | `src/components/profile/ProfileSettingsSection.tsx:21` | `displayMode`, 화면/다크 모드 변경 콜백, 단원 변경, 선택적 로그아웃 콜백, 로그아웃 상태를 받음 | 설치 가능한 카드가 아닌데도 메뉴 행 wrapper가 남으면 빈 행·구분선이 표시됨 | 설치 카드의 가시성과 부모 행을 일치시킴 |
| `InstallAppCard` | `src/components/InstallAppCard.tsx:20` | `{ compact?: boolean }`; 설치 완료/standalone이면 `null`, 그 외 설치 안내 UI 반환 | 반환값이 `null`일 수 있음을 무시하면 부모 목록에 빈 행이 남음 | 기존 컴포넌트와 설치 상태 판정을 재사용 |
| `SyncStatus` | `src/components/SyncStatus.tsx:13` | 외부 저장소의 동기화 상태를 구독하고 전역 재시도 버튼 표시 | 설정 메뉴에서 동기화 행을 제거한 것을 전역 재시도까지 제거한 것으로 오해할 수 있음 | 전역 동기화·재시도 UI를 유지하고 새 재시도 로직을 만들지 않음 |
| `ActiveVideoState` | `src/components/audio/audioPlayerContext.ts:12` | `{ track, pieceTitle, resumeAt }` | URL만 바뀌고 오류 상태가 남으면 새 선택도 fallback에 갇힐 수 있음 | 현재 플레이어가 선택하는 `activeVideo`를 유지 |
| `VideoStage` | `src/components/audio/VideoStage.tsx:23` | `activeVideo`, `playbackSpeed`, 준비/상태/위치 콜백; 영상 영역 또는 fallback 반환 | 실패 상태가 영상 ID와 분리돼 있으면 다음 유효 영상이 렌더링되지 않을 수 있음 | 기존 컴포넌트의 오류 상태 수명과 effect cleanup 보완 |
| `StickerBoardSheet` | `src/components/profile/StickerBoardSheet.tsx:19` | 스티커·스태프 여부·안 본 ID·닫기 콜백; 현재 `role=dialog`, `aria-modal`, Escape/배경 닫기 | 포커스 이동·가두기·복원 없이 `aria-modal`만 두면 키보드 사용자가 배경으로 이동 가능 | 현재 팝업과 `onClose` 계약 유지, focus 동작 보완 |
| `ProfileStickersPreviewCard` | `src/components/profile/ProfileStickersPreviewCard.tsx:17` | 스티커·스태프 여부·신규 수·열기 콜백; `role=button`과 `tabIndex`가 있으나 키 활성화 처리는 없음 | 카드가 Tab으로 포커스돼도 Enter/Space로 열리지 않음; 팝업 닫은 뒤 opener 복귀에도 참조 필요 | 기존 `onOpen` 경로를 유지하며 버튼 의미·키보드 활성화와 opener 초점 복원 추가 |
| `PassionTemperatureResult` | 정의 `src/utils/passionRules.ts:18`; 계산 모듈에서 사용 `src/utils/passionTemperature.ts:15` | `value`, `weeklyDelta`, `windowSize`, 그룹 목록; 온도는 숫자 °C | 텍스트 값 또는 다른 단위를 가정하면 위치 계산이 틀어짐 | 계산 결과의 `value`(°C)를 그대로 사용 |
| `PASSION_RULES` | `src/utils/passionRules.ts:25` | 기준 36.5, 최소 34.0, 최대 42.0 | UI에 별도 범위를 하드코딩하면 계산·표시 범위가 어긋날 수 있음 | UI 눈금·ARIA·위치 계산에 이 상수를 사용 |
| `computePassionTemperature` | `src/utils/passionTemperature.ts:62` | 회원, 전체 회원, 일정, 로그, RSVP 이벤트, 설정, 기준 날짜, 선택 옵션을 받고 `PassionTemperatureResult` 반환 | 전체 인자를 빼거나 UI에서 점수를 다시 계산하면 출결/온도 판정이 분리됨 | 기존 계산 결과를 재사용하고 이번 티켓에서는 점수 계산을 바꾸지 않음 |
| `ProfilePassionTempCard` | `src/components/profile/ProfilePassionTempCard.tsx:9` | 계산 결과와 열기 콜백을 받고 온도 숫자·막대·눈금·현재값 표시 | `value`와 막대가 서로 다른 반올림/범위를 사용하면 숫자와 시각 위치가 달라짐 | 범위 계산은 이 컴포넌트 한 곳에서 공통 상수로 수행 |

## 2. 구현 티켓 — 순서대로, 항목별 커밋

### READY-01. 설치 완료 상태의 빈 메뉴 행 제거 — P2

**근거:** `ProfileSettingsSection`은 설치 카드를 감싼 메뉴 행을 항상 렌더링한다. 자식 `InstallAppCard`는 설치 완료 또는 standalone 환경에서 `null`을 반환한다.

- **할 일:** `ProfileSettingsSection`과 `InstallAppCard`의 표시 계약을 조정해 설치 항목이 표시되지 않는 경우 빈 메뉴 행·구분선도 렌더링하지 않는다. 설치 가능한 환경의 기존 버튼/설명 동작은 유지한다. `SyncStatus` 전역 재시도는 그대로 둔다.
- **하지 말 것:** 설치 상태 판정을 설정 화면에 복제하거나 전역 동기화·재시도 기능을 제거하지 않는다.
- **테스트 경계(입력 → 기대 결과):**
  - 설치 미완료, 설치 안내 제공 가능 → 설치 행과 동작 표시.
  - 이미 설치됨 또는 standalone → 설치 메뉴 행과 빈 구분선 모두 없음.
  - Kakao 인앱 환경 → 기존 기본 브라우저 이동 동작은 유지하고 행이 빈 공간으로 바뀌지 않음.
- **확인:** 설치 상태별 설정 화면을 브라우저에서 확인하고 390×844에서 `document.documentElement.scrollWidth === 390` 기록.

### READY-02. 영상 변경 시 YouTube 오류 상태 복구 — P2

**근거:** `VideoStage`의 `loadError`는 실패 때 `true`가 되고, `videoId` 변경 effect에서 초기화되지 않는다. 오류 화면으로 전환하면 플레이어 컨테이너 ref도 사라질 수 있어 후속 영상 로딩이 막힐 수 있다.

- **할 일:** 실패 상태를 boolean 하나가 아니라 실패한 `videoId`에 귀속한다. 새 ID 선택 시 이전 실패 상태가 새 영상 표시를 막지 않게 하고 새 플레이어 로드를 시작한다. 이전 effect cleanup과 늦게 도착한 이벤트의 취소 가드는 유지해 구 ID 오류가 새 선택에 적용되지 않게 한다. 실패한 현재 영상은 기존 외부 링크 fallback을 유지한다.
- **하지 말 것:** 유효한 현재 영상의 오류를 조용히 성공으로 처리하거나, 이전 비디오 플레이어를 숨겨 재생 상태로 남기지 않는다.
- **테스트 경계(입력 → 기대 결과):**
  - 첫 영상 API 오류 → fallback 표시; 다른 유효 영상 선택 → 새 로드 시도와 영상 영역 표시.
  - 영상 A 로드 대기 중 영상 B 선택, A 응답이 늦게 도착 → A 플레이어는 붙지 않고 B만 표시.
  - 새 영상도 오류 → fallback이 유지되고 해당 URL을 열 수 있음.
- **확인:** 브라우저에서 실패 후 다른 영상 재선택을 확인하고, 실제 YouTube 임베드 재생 가능 여부는 네트워크가 허용될 때만 별도로 기록.

### READY-03. 열정 온도 막대와 36.5°C 기준점 일치 — P2

**근거:** 현재 식은 `clamp(((value - 34.0) / 8.0) × 100)`이고 기준 눈금은 31.25%로 고정돼 있다. `PASSION_RULES`는 최소 34.0, 기준 36.5, 최대 42.0을 정의하며 `computePassionTemperature`는 최종값을 0.1°C 단위로 반올림하고 범위를 자른다. 코드만으로는 보고된 화면 어긋남을 재현하지 못했다.

- **할 일:** `ProfilePassionTempCard`의 최소·최대·기준 눈금·ARIA 범위를 `PASSION_RULES`로 단일화한다. 현재 숫자, 막대 끝, 원형 표시 위치는 같은 `result.value`와 같은 범위에서 계산한다. 36.5°C 입력 시 표시 원의 중심이 눈금 중심에 오도록 한다.
- **하지 말 것:** 온도 점수 계산·기준값·표시 범위를 바꾸거나 새 눈금 문구를 추가하지 않는다. 실제 좌표가 기대값과 다르면 CSS 좌표계를 먼저 조사하고, 제품 규칙 변경이 필요해 보이면 멈춰 보고한다.
- **끝까지 손계산:** 빈 기록 → `computePassionTemperature.value = 36.5`; `(36.5−34)/(42−34)×100 = 31.25%`; 눈금과 표시 원 중심이 같은 x 좌표여야 한다. `38.6°C` → `57.5%`.
- **테스트 경계(입력 → 기대 결과):**
  - 36.5°C → `aria-valuenow=36.5`, 위치 31.25%, 눈금과 원 중심 차이 1 CSS px 이하.
  - 38.6°C → 위치 57.5%; 숫자·막대·ARIA가 모두 38.6°C를 반영.
  - 34.0°C / 42.0°C → 각각 0% / 100%; 숫자·막대 위치·meter 범위가 양 끝값에서 서로 일치.
- **확인:** 390×844 및 1280px 브라우저에서 실제 track 폭을 읽어 `tick.centerX`와 `indicator.centerX`를 비교한다. jsdom/SSR 문자열 테스트만으로 화면 위치를 통과 처리하지 않는다.

### READY-04. 스티커 팝업 포커스 관리 — P2 접근성

**근거:** 현재 dialog에는 `aria-modal="true"`와 Escape/배경 닫기가 있지만, 초점 이동·팝업 내부 제한·닫은 뒤 복원이 없다. 미리보기 카드도 `role=button`과 `tabIndex`만 있고 Enter/Space 활성화 처리가 없다.

- **할 일:** 카드가 Enter/Space로 열리도록 버튼 의미·키보드 활성화를 보완한다. 팝업을 열 때 초점을 내부로 옮기고 Tab/Shift+Tab이 팝업 밖으로 나가지 않게 한다. Escape·닫기 버튼·배경 클릭으로 닫으면 기존 `onClose`를 한 번만 실행하고 초점을 실제 opener로 돌린다.
- **하지 말 것:** 신규 의존성이나 안내 문구를 추가하지 않는다. 팝업 내부 클릭은 닫기로 전파하지 않는다. 닫을 때 기존 읽음 처리 동작을 유지한다.
- **테스트 경계(입력 → 기대 결과):**
  - 키보드로 카드에 초점을 두고 Enter 또는 Space → 팝업 열림, 초기 초점이 팝업 내부.
  - 반복 Tab/Shift+Tab → 포커스가 팝업 안에 순환.
  - Escape 또는 닫기 버튼 → 닫히고 opener에 포커스 복귀, 닫기 처리는 1회.
  - 카드 내부 클릭 → 닫히지 않음; overlay 바깥 영역 클릭 → 닫히고 기존 읽음 처리 1회.
- **확인:** 마우스 없이 열기·순회·닫기를 실제 브라우저에서 확인한다.

### READY-05. 출시 전 환경·CI 검증 — 차단 게이트

- 이번 변경을 포함한 새 커밋을 PR #46에 반영한 뒤, **새 HEAD** 기준 Green Bar·DB 검사·반복 실수 검사 결과를 확인한다. 현재 GitHub 초록 상태를 새 diff의 검증으로 간주하지 않는다.
- 정상 네트워크에서 테스트 회원으로 초기 데이터·활동·연습곡 조회와 전역 동기화 상태를 확인한다. 실패 시 `net::ERR_FAILED` 같은 전송 실패와 실제 서버 응답 오류를 구분해 기록한다. 실패 상태가 성공처럼 보이거나 원인이 미확인인 동안 출시 판단을 멈춘다.
- 운영 DB에 직접 접속하거나 SQL을 실행하지 않는다. 운영 경로 확인과 적용 전후 검증은 저장소 규칙에 따라 리뷰어가 한다.
- 현재 로컬 빌드는 메인 JavaScript 청크 1,187.03 kB 및 500 kB 초과 경고를 냈다. 이 숫자를 새 UI의 회귀라고 단정하지 말고 기준 빌드와 비교한다. 이번 UI 버그 수정에 무관한 코드 분할은 별도 승인 없이 끼워 넣지 않는다.
- **테스트 경계(입력 → 기대 결과):**
  - 네트워크 정상 → 초기 동기화·프로필 활동·연습곡 카탈로그가 로드되고 상태가 성공으로 바뀜.
  - 네트워크 실패 → 동기화 실패가 표시되고 재시도할 수 있으며, 성공 문구나 성공 시각으로 대체되지 않음.
  - PR head가 기존 `0e6947e` → 현재 로컬 diff 검증으로 인정하지 않음; 새 커밋의 세 CI 결과가 모두 성공해야 함.
- **보고:** 새 HEAD, CI 결과, 실제 브라우저 동기화 결과, 390px `scrollWidth`, 온도 눈금/원 중심 거리, 미확인 항목을 분리한다. 머지·배포는 별도 승인 전 수행하지 않는다.

## 3. 순서·브랜치·멈춤 조건

1. 구현 전 `/spec-check`로 각 티켓의 파일·계약을 다시 대조한다.
2. 기준은 `feat/v3-activity-2`의 PR #46 (`feat/v3-profile` 대상)이다. 현재 UI diff가 미커밋이므로 이를 새 티켓에 무심코 섞지 말고, 변경 단위를 사용자와 합의한 커밋 흐름에 따라 분리한다.
3. READY-01 → READY-02 → READY-03 → READY-04 순서로 진행하며 항목별로 별도 커밋한다. READY-05는 모두 끝난 뒤 출시 차단 게이트로 수행한다.
4. 각 코드 티켓은 수정 전 실패하는 테스트를 확인한 뒤 수정·Green Bar·브라우저 확인을 거친다.
5. 36.5°C 기준값이나 제품 표시 범위를 바꿔야만 맞출 수 있거나, 동기화 실패가 서버/RPC 설정 문제로 확인되면 임의로 우회하지 말고 멈춰 보고한다.
6. DB 변경·운영 SQL·PR 머지·배포는 이 계획 범위가 아니다.

## 4. 작성 검증

- [x] 기존 함수·컴포넌트·타입의 파일:행과 인자 계약을 현재 코드에서 확인했다.
- [x] 온도는 숫자 °C이며, 계산 함수가 34.0~42.0으로 자르고 0.1°C 단위로 반올림함을 확인했다. 새 날짜/시간 변환이나 DB 열 사용은 없다.
- [x] 각 티켓에 정상/경계 입력과 기대 결과를 적었다.
- [x] 온도 36.5°C → 31.25% → 눈금과 표시 원 중심 일치로 끝까지 손계산했다.
- [x] 온도 계산은 기존 `computePassionTemperature`를 재사용하고, UI 좌표 변환은 한 컴포넌트에서 공유 상수를 사용하도록 했다.
- [ ] 독립 `spec-auditor` 서브에이전트 검토: 현재 도구 목록에 서브에이전트 실행 도구가 없어 미실행. 아래 결과는 자체 검토다.

### 자체 검토 결과

- 온도 표시 불일치는 현재 코드만으로 재현되지 않는다. 그래서 제품 수치나 온도 범위를 바꾸지 않고, 표시 좌표를 측정하는 조건을 수용 기준에 넣었다.
- 설치 완료/standalone에서 `InstallAppCard`가 `null`이 되는 계약과 부모의 상시 wrapper를 함께 기술했다.
- `VideoStage`의 오류는 영상 ID 단위로 관리하도록 했으며, 기존 effect cleanup과 늦은 응답 취소 조건을 보존하도록 범위를 제한했다.
- 키보드로 스티커 카드 열기부터 팝업 닫은 뒤 opener 복귀까지 포함해 접근성 경로를 점검하도록 했다.

## 5. 현재 구현 상태 (2026-11-23)

- **READY-01 완료:** compact 설치 카드가 실제 렌더링될 때만 메뉴 행을 만든다. standalone이면 빈 행이 없다. Kakao 인앱 브라우저 동작 유지도 테스트했다.
- **READY-02 완료:** YouTube 오류를 실패한 영상 ID에 귀속한다. 실패 후 다른 영상 로드와 이전 영상의 늦은 API 응답 무시를 테스트했다.
- **READY-03 완료:** 막대 범위·기준 눈금·meter 범위를 `PASSION_RULES`에서 가져온다. Chrome에서 실제 `profile.css` 레이아웃을 390px/1280px 뷰포트로 측정했으며, 문서 폭은 각각 390px/1280px, 막대 track은 326px/416px, 눈금 중심과 표시점 중심 차이는 각각 0.5 CSS px였다.
- **READY-04 완료:** 스티커 미리보기는 native button이며, 모달은 초기 포커스·Tab/Shift+Tab 가두기·Escape/닫기 버튼/배경 닫기·opener 복귀를 처리한다. 키보드 경계 테스트를 추가했다.
- **로컬 검증:** `npm run typecheck && npm run lint && npm test && npm run build` 통과(122개 파일, 844개 테스트). `BASE_REF=origin/feat/v3-profile ./scripts/ci/guards.sh` 통과. `localhost:5173` 응답은 HTTP 200.
- **빌드 경고:** 메인 JS 청크 1,187.80 kB, 500 kB 초과 경고가 남아 있다. 이전 확인값 1,187.03 kB 대비 0.77 kB 증가했다.
- **READY-05 차단:** 실제 브라우저에서 전역 동기화 재시도는 성공했고 `✓ 방금 동기화됨`으로 바뀌었다. 그러나 `fn_get_member_activity` 요청은 HTTP 404를 반환했다(브라우저 Performance Resource Timing에서 확인). 저장소에는 이 RPC 정의가 [20261124000000_v3_activity.sql](../../supabase/migrations/20261124000000_v3_activity.sql)의 255행에 있다. 운영 DB에 접근하지 않았으므로 원인은 미확인(마이그레이션 미적용 여부 포함)이다. 전역 동기화 성공 표시만으로 활동 데이터까지 정상이라고 판정하면 안 된다.
- 원격 PR #46은 OPEN이며 확인 당시 head는 `0e6947e5f2b3fc6409f2890b892498030215dcff`; 그 커밋의 GitHub CI 체크는 성공이었다. 현재 변경은 미커밋이어서 원격 CI에는 포함되지 않았다.
- 실제 앱 브라우저: viewport/document width 390/390px, 설정 메뉴 5행, 36.5°C 기준점·표시점 중심 차이 0.5px. 스티커 팝업을 Enter로 열고 Tab/Escape로 닫아 포커스 복귀를 확인했다. 화면 계정은 ADMIN이며 본인 스티커 데이터가 0/24여서 일반 단원의 획득 이력은 검증하지 않았다.
- 로컬 PostgreSQL 검사는 미실행: `psql`/`pg_isready`가 없고 Docker daemon 연결도 실패했다. 이번 변경에는 SQL/DB 파일 변경이 없다. 운영 RPC 적용 여부를 확인하거나 SQL을 실행하지 않는다.
