# 21. 출석 인증 화면 개편 개발 지시서 (V3-23)

> 작성: 리뷰어(Claude), 2026-11-24. 기준 코드: `origin/main` @ `23f9d71`. spec-auditor 검토(차단 1·수정 14·사소 12)를 반영한 판이다(§6).
> 시안(사용자 확정): https://claude.ai/artifact/78R1NaARRVq6a9zKrpZM9r 맨 아래 줄 "출석 인증 (QR · PIN)"의 `QRScan`, `QRPin`, `QRPinError`, `QRDone`, `QRFail`. 시안의 hex는 쓰지 않는다(§3 R8). 시안의 예시 이름·시각은 넣지 않는다.
> 시작 전: `.agents/rules/recurring-mistakes.md`를 읽고 `/spec-check`로 §2 표를 코드에 대 본다. 어긋나면 시작하지 말고 보고한다.
> 브랜치: **홈 B안 PR #59가 main에 병합된 뒤** main에서 새 브랜치 `feat/checkin-ui`. #59와 `Icons.tsx`, `scripts/dev/capture-screens.mjs`가 겹치고, #59의 `formatCardDateLine`·캡처 스크립트를 재사용하기 때문이다.

---

## 1. 바뀌는 것 한 줄

출석 인증 화면(`QRScannerModal`)의 모양을 홈 B안과 같은 기준으로 바꾼다. QR 인식, 위치·반경 판정, PIN 확인, 저장 내용(`RawAttendanceLog`)은 바꾸지 않는다.

**바뀌는 동작(이것만, 각각 §3 규칙):**
1. 완료 화면의 닫기도 `onSuccess`를 부른다(R6). 남는 차이: 완료 화면에서 휴대폰 뒤로가기로 닫으면 지금처럼 새로고침 없이 닫힌다.
2. **PIN 출석(`authMethod === 'MANUAL_PIN'`)일 때만**, 저장 단계의 PIN 불일치·잠금 오류를 실패 화면 대신 PIN 탭 오류로 보여 준다(R4). QR 출석의 저장 오류는 지금처럼 실패 화면이다.
3. 반경 밖일 때 `pinError` 설정(`:138-140`)과 저장 실패 때 `setPinError(message)`(`:172`)를 지운다. 지금은 실패 화면에서 "다시 스캔 시도하기"를 누르면 PIN 탭에 이 문구가 다시 나온다. 앞으로는 실패 화면에서 돌아올 때 `pinError`를 비운다(R5).
4. `<input type="tel">`을 화면 숫자판과 실제 키보드 처리로 바꾼다(R4). `autoFocus`와 붙여넣기는 없어진다.
5. 완료 화면의 일정·장소가 prop `schedule`이 아니라 실제로 출석한 일정(`targetSchedule`)과 `resolveScheduleLocation` 이름이 된다(R6). 그래서 장소가 일정 한 줄과 다를 수 있다(프리셋이 안 맞으면 기본 프리셋 이름, `sheetsParser.ts:31-41`).
6. 92% 폭 모달이 휴대폰에서는 전체 화면이 된다(R1).

### 데이터 경로 (바뀌지 않음, 화면만 바뀜)

| 단계 | 원천 → 처리 → 화면 |
|---|---|
| QR | 카메라 → `BarcodeDetector`/`jsQR` → `parseQRPayload` → (`findActiveScheduleForMasterQR`) → `executeCheckIn` |
| PIN | 숫자판 입력 4자리 → `verifyOnSitePin` → `executeCheckIn(schedule, 'MANUAL_PIN', pin)` |
| 위치 | `acquirePosition` → `isWithinRadius`(또는 비상 면제) → 통과 / 실패 화면 |
| 저장 | `RawAttendanceLog` → `addCheckInLog(log, pin?)` → 완료 화면 → `onSuccess(log)` |

---

## 2. 기존 코드 계약 표 (리뷰어가 `origin/main`에서 직접 연 것)

| 이름 | 정의 위치 | 호출부 | 받는 것 → 돌려주는 것 | 이 티켓에서 |
|---|---|---|---|---|
| `QRScannerModal` | `src/components/QRScannerModal.tsx:28`(767줄) | `App.tsx:511`(유일) | `schedule`, `profile`, `onClose`, `onSuccess(log)` | props는 그대로. 화면을 나눠 줄인다(R9) |
| 상태들 | `QRScannerModal.tsx:45-64` | — | `activeTab`, `inputPin`, `pinError`, `cameraError`, `isProcessing`, `needsExternalBrowserHint`, `geoStatus`(문자열), `scanResult`, `savedLog`, `successTimeStr` | `geoStatus` 문자열과 `scanResult.msg` 대신 종류 값으로 바꾼다(R2·R5) |
| `executeCheckIn` | `QRScannerModal.tsx:71-201` | QR·PIN 처리 | 위치 확인 → 반경 확인 → 저장 → 진동·소리 → 완료 | 순서와 저장 내용(`log`)은 그대로. 화면에 넘기는 값만 바꾼다 |
| 카메라 effect | `QRScannerModal.tsx:226-327` | — | 카메라 켜기, 프레임 해석, 정리 | **이 블록은 고치지 않는다.** `: any`·`as any`가 있어 다른 파일로 옮기면 CI 검사(`scripts/ci/guards.sh:22`, 추가된 줄 검사)에 걸린다. JSX의 `<video ref={videoRef}>`만 새 자리로 옮긴다 |
| `handlePinSubmit` | `QRScannerModal.tsx:329-353` | PIN form | 4자리 확인 → `verifyOnSitePin` → `executeCheckIn` | 숫자판에서 부르도록 연결(R4) |
| `sheetsService.verifyOnSitePin` | `src/services/sheets.ts:1570` | 위 | 실패 시 서버 `message`로 throw. `fn_verify_on_site_pin` **최신 정의** `supabase/migrations/20261121000000_security_hardening.sql:207-231`: 잠금 "시도 횟수가 너무 많습니다. …"(`:215`), "현장 인증 PIN이 설정되지 않았습니다."(`:220`), "현장 PIN 번호가 일치하지 않습니다."(`:229`) | 문구 분류(R4) |
| `sheetsService.addCheckInLog` | `src/services/sheets.ts:850` | `executeCheckIn` | 저장. PIN 출석이면 서버가 PIN을 다시 확인한다. `fn_record_attendance` **최신 정의** `supabase/migrations/20261121010000_fix_onsite_pin_payload_key.sql:14-71`: 잠금(`:40`), "현장 출석 PIN 번호가 일치하지 않습니다."(`:49`) | 실패 종류 분류(R4·R5) |
| `sheetsService.resolveScheduleLocation` | `src/services/sheets.ts:288` | `executeCheckIn` | → `{targetLat, targetLon, radiusMeters, locationName}` | 실패·완료 화면의 장소 이름 |
| `sheetsService.isEmergencyGpsBypassed` | `src/services/sheets.ts:1674` | `executeCheckIn` | 비상 위치 면제 | 그대로 |
| `acquirePosition` / `GeoAcquireError` / `describeGeoFailure` / `formatAccuracySuffix` | `src/utils/geoPosition.ts:71` / `:9` / `:40` / `:140` | `executeCheckIn` | 위치 측정, 실패 이유 문구 | 그대로 재사용 |
| `classifyCameraError` / `describeCameraFailure` | `src/utils/geoPosition.ts:111` / `:124` | 카메라 effect | 카메라 실패 문구("…[현장 PIN 번호]으로 출석해 주세요.") | 문구 안 탭 이름을 바꾼다(R3) |
| `parseQRPayload` / `findActiveScheduleForMasterQR` / `playScanSuccessSound` | `src/utils/qr.ts:74` / `:37` / `:121` | 위 | — | 그대로 |
| `detectInstallEnvironment` / `isStandaloneDisplay` / `buildKakaoExternalBrowserUrl` | `src/utils/pwaInstall.ts:8` / `:72` / `:17` | `QRScannerModal.tsx:53-55,508,662` | 카카오톡 안 안내 | **유지**(R3·R5) |
| `getKSTTimestampString` / `getKSTClock` | `src/utils/date.ts:42` / `:87` | `executeCheckIn` / 홈 | KST 시각 / 'HH:mm' | 완료 시각은 `getKSTClock(log.timestamp)`(R6). `toLocaleTimeString`(`:190`)은 지운다 |
| `useOptionalAudioPlayer` | `src/components/audio/audioPlayerContext.ts:76` | `QRScannerModal.tsx:34-43` | 열 때 음악 일시정지 | 그대로 |
| `IconQrScan`, `IconKeypad`, `IconLocation`, `IconClose`, `IconSync`(`Icons.tsx:101`) | `src/components/Icons.tsx` | — | — | 재사용. 없는 아이콘(지우기, 카메라 꺼짐, 위치 꺼짐)은 `Icons.tsx`에 `IconBackspace`, `IconCameraOff`, `IconLocationOff`로 추가 |
| 옛 스캐너 CSS: `.viewfinder-*`, `.camera-viewfinder-*`, `.corner`(`index.css:2686-2724`), `.camera-video-stream`, `.camera-fallback-box`, `@keyframes laserScan` | `src/index.css:2630-2730` 부근 | `QRScannerModal.tsx`만(리뷰어 grep) | 옛 스캐너 스타일 | 다른 사용처가 없으면(grep 결과 보고) 지운다. `src/styles/hexColorAllowlist.json:79-98`의 `QRScannerModal` 항목도 지운다 |
| `formatCardDateLine` | `src/utils/homeCardText.ts:8`(PR #59) | 홈 카드 | 일정 → "11월 24일 화 · 19:30 ~ 21:40" | 일정 한 줄에 재사용(R1). 종료 시각이 비면 "14:00"만 나오게 이 함수를 고친다(운영 일정 25건은 모두 종료 시각 있음, 리뷰어 확인) |
| `App.test.tsx:291` | — | — | 뒤로가기(popstate) 때 카메라가 꺼지는지 검사 | `<video>`를 자식으로 옮겨도 통과해야 한다(회귀 기준) |
| `CHECKIN_OPEN_BEFORE_MIN` | `src/utils/timeWindow.ts:4` | — | 60 | 참고만. 이 화면은 홈 카드 CTA "QR 찍기 / PIN 출석"(`src/utils/todayCta.ts:124`)이 연다 |

표에 없는 이름을 새로 쓰려면 먼저 보고한다.

---

## 3. 규칙과 경계 예시

### R1. 화면 틀

- **스캔·PIN 화면**은 위에서부터 이 순서다(시안 `QRScan`·`QRPin`). **완료·실패 화면**은 머리에 닫기 버튼만 두고 제목·일정 한 줄·탭을 두지 않는다(시안 `QRDone`·`QRFail`). 벽 QR로 다른 일정에 출석했을 때 두 일정이 한 화면에 같이 보이지 않게 하려는 것이다.
  1. 머리: 제목 "출석 인증" + 닫기(`IconClose`, 44px)
  2. 일정 한 줄: 일정 이름 + 오른쪽에 `{이름} · {파트}`(기존 `currentName`·`currentPart`, `:66-68`), 아래 줄에 `formatCardDateLine(schedule)` + ` · ` + `schedule.locationName`(비면 "장소 미정", 지금 `:193`과 같은 대체값)
  3. 탭(QR 스캔 | 현장 PIN)
  4. 본문
  5. 위치 줄(R2)
- 휴대폰 폭에서는 화면 전체(높이 `100dvh`)를 쓰고, 위아래에 `env(safe-area-inset-top/bottom)` 여백을 준다. 600px 이상에서는 가운데 최대 폭 440px 판으로 둔다(지금 `maxWidth: '440px'`과 같은 값).
- 바깥 판에 `role="dialog"`, `aria-modal="true"`, `aria-label="출석 인증"`을 주고, 열 때 닫기 버튼으로 포커스를 옮긴다.
- 처리 중(`isProcessing`)에는 닫기를 막는다(지금과 같음, `:390`).
- 모든 안내 글자에 `word-break: keep-all`을 준다. 제목과 문단에는 `text-wrap: balance`를 준다(사용자 결정).
- 탭은 `role="tablist"`/`role="tab"`/`aria-selected`. 버튼 높이는 48px 이상.

| 입력 | 기대 |
|---|---|
| 390×844 | 화면 전체, 가로 스크롤 없음(`scrollWidth` 390) |
| 1280×800 | 가운데 440px 판 |
| 처리 중 닫기 누름 | 반응 없음 |
| 375×667, PIN 탭 | 가로 스크롤 없음. "출석하기" 버튼이 보이거나 세로 스크롤로 닿음 |
| `formatCardDateLine({date:'2026-11-21', startTime:'14:00', endTime:''})` | "11월 21일 토 · 14:00" |

### R2. 위치 줄 (사용자 확인 대기: 시안과 다름)

지금 코드는 **출석을 시도할 때만** 위치를 잰다(`executeCheckIn` 안, `:93-127`). 시안은 스캔 전부터 "위치 확인됨"을 보여 주지만, 열자마자 위치를 재는 것은 새 기능이라 넣지 않는다. 위치 줄은 **실제 상태만** 보여 준다. 사용자가 다르게 정하면 이 절만 바뀐다.

`geoStatus`를 문자열 대신 종류 값으로 바꾼다. 문구는 순수 함수 `geoStatusLabel(kind, accuracyMeters)`로 만든다. 정확도 꼬리는 기존 `formatAccuracySuffix`(" (측정 오차 약 ±n m)") 하나만 쓴다.

| 종류 | 언제 | 문구 | 색 |
|---|---|---|---|
| `idle` | 처음, 실패 화면에서 돌아왔을 때 | "출석할 때 위치를 확인해요" | 아이콘·글자 `--text-sub` |
| `measuring` | 측정 중(면제 여부 무관) | "위치 확인 중…" | `--text-sub` |
| `ok` | 반경 안, 정상 측정 | "위치 확인됨" + 꼬리 | 아이콘 `--status-success`, 글자 `--text-main` |
| `ok_low` | 반경 안, 저정밀 측정 | "위치 확인됨 · 정확도 낮음" + 꼬리 | 같음 |
| `bypass_measured` | 비상 면제, 위치는 얻음(`:104`) | "위치 확인됨 (비상 면제)" | 아이콘 `--status-warning`, 글자 `--text-main` |
| `bypass_skipped` | 비상 면제, 위치 실패(`:113`) | "위치 확인 생략 (비상 면제)" | 같음 |

- 반경 밖(`OUT_OF_RANGE`)이나 위치 실패면 위치 줄을 `ok`로 바꾸지 않고, 실패 화면으로 간다. 지금 `:102-108`은 판정 전에 "위치 확인됨"으로 바꾼다. 앞으로는 **반경 판정 뒤에** 상태를 정한다.
- 실패 화면에서 "다시 확인하기"로 돌아오면 `idle`이다.
- 위치 줄은 `role="status"`.

| 입력 | 기대 |
|---|---|
| 열자마자 | "출석할 때 위치를 확인해요" |
| 반경 안, 정확도 25m | "위치 확인됨 (측정 오차 약 ±25m)" |
| 반경 밖 → 실패 화면 → 다시 확인하기 | "출석할 때 위치를 확인해요"(초록 아님) |
| 면제, 위치 얻음 | "위치 확인됨 (비상 면제)" |
| 면제, 위치 실패 | "위치 확인 생략 (비상 면제)" |

### R3. QR 탭 (시안 `QRScan`)

- 카메라 판: 둥근 어두운 판이 남은 높이를 채운다. 안에 `<video>`(지금 속성 그대로)와 네모 틀(모서리 4개), 스캔 줄을 둔다. 판 아래쪽 안에 안내 "현장 QR을 네모 안에 맞춰 주세요"를 둔다.
- 판 아래에 위치 줄(R2), 그 아래 안내 "카메라가 안 열리거나 QR이 안 보이면 현장 PIN 탭을 눌러 주세요."를 둔다.
- 카메라 실패(`cameraError` 있음): 판 안에 `IconCameraOff` + `cameraError` 문구를 보여 준다. 카카오톡 안이면 기존 "기본 브라우저로 열기" 링크도 둔다(`:660-679` 동작 유지).
- `describeCameraFailure` 문구 안의 "[현장 PIN 번호]"는 새 탭 이름에 맞춰 "[현장 PIN]"으로 바꾼다(5곳, `geoPosition.ts:127,129,131,133,135`). UNSUPPORTED 문구의 "아래 [현장 PIN 번호]으로"(`:127`)는 탭이 위에 있으므로 "[현장 PIN]으로"로 바꾼다("아래" 삭제).
- 카메라 판은 `role="img"`가 아니라 영상 자리이므로 `aria-label="카메라 화면"`만 준다.

| 입력 | 기대 |
|---|---|
| 카메라 권한 거부 | 판 안에 "카메라 권한이 꺼져 있습니다. … [현장 PIN]으로 출석해 주세요." |
| 카카오톡 안 + 카메라 실패 | 위 문구 + "기본 브라우저로 열기" 링크(44px 이상) |
| QR 인식 | 지금처럼 `executeCheckIn` → 위치 줄 `measuring` |

### R4. PIN 탭 (시안 `QRPin`, `QRPinError`)

- 안내 "현장에 안내된 4자리 번호를 입력해 주세요." 아래에 4칸을 둔다. 입력된 칸은 점, 다음 칸은 커서, 나머지는 빈칸이다. 4칸 묶음은 `aria-label="PIN 입력칸"`이고, 입력 개수를 `aria-live`로 읽어 준다("2자리 입력됨").
- 숫자판은 3×4다(1~9, 빈칸, 0, 지우기). 버튼 높이는 64px. 지우기는 `IconBackspace`이고 `aria-label="지우기"`를 단다.
- **실제 키보드도 받는다.** 숫자 키, Backspace, Enter를 처리한다. 지금 쓰는 `<input type="tel">`(`:721-737`)은 지운다. 휴대폰 시스템 키보드는 뜨지 않는다.
  - 키 처리 조건: PIN 탭이고, 결과 화면이 아니고, 처리 중이 아닐 때만.
  - 무시: `e.target`이 input·textarea·contenteditable·**button**일 때(버튼 Enter는 버튼 자체 클릭이 처리), Ctrl·Meta·Alt 조합, `e.isComposing`.
  - 처리한 키는 `preventDefault()`.
  - **중복 제출 막기:** 제출 중 여부를 상태가 아니라 `useRef`로 막는다(`handlePinSubmit`의 `isProcessing` 확인 `:331`은 같은 순간 두 번 불리면 둘 다 통과한다).
  - 입력 계산은 순수 함수 `nextPinState(state, key)`(`src/utils/pinPad.ts`)로 한다.
- 버튼 "출석하기"는 4자리가 아니면 비활성이다. 처리 중에는 "확인 중…"을 보여 준다. 누르면 `handlePinSubmit`과 같은 흐름이다.
- 4자리를 넘게 입력하면 무시한다. 숫자가 아닌 키도 무시한다.
- **오류 분류(순수 함수 `classifyPinError(message)`, `src/utils/checkinMessages.ts`):** 메시지에 "일치하지 않습니다"가 들어 있으면 `'WRONG'`, "시도 횟수가 너무 많습니다"가 들어 있으면 `'LOCKED'`, 나머지는 `'OTHER'`이다. 이 흐름(verify·record)에서 나오는 문구는 리뷰 때 전부 확인했다(§6 S13 표). 다른 "일치하지 않습니다" 문구는 다른 액션에서만 나온다.
  - WRONG: 4칸 테두리가 `--status-danger`가 되고 칸이 흔들린다. 위 안내 자리에 "PIN이 맞지 않아요. 현장 안내의 번호를 다시 확인해 주세요."(`role="alert"`)를 보여 준다. 버튼은 "다시 입력해 출석하기"로 바뀌고, 누르면 입력과 오류를 비운다. 숫자 키를 누르면 입력을 비우고 그 숫자부터 다시 시작한다.
  - LOCKED·OTHER: 같은 자리에 서버 문구를 그대로 보여 준다(예: "현장 인증 PIN이 설정되지 않았습니다."). 칸은 흔들지 않고 입력도 유지한다. 이 상태에서 4자리가 찬 채로 숫자를 누르면 무시하고, Backspace는 한 자리 지운다.
- **PIN 출석일 때만**, `addCheckInLog`가 WRONG·LOCKED로 분류되는 오류로 실패하면 PIN 탭 오류로 보여 준다. 실패 화면으로 보내지 않는다. QR 출석과 그 밖의 저장 오류는 실패 화면(R5 `SAVE_FAILED`)이다.
- 반경 밖 PIN 시도는 지금처럼 실패 화면(R5 `OUT_OF_RANGE`)으로 간다. 이때 `pinError`를 설정하지 않는다(`:138-140` 삭제. 지금은 실패 화면에서 돌아오면 PIN 탭에 이 문구가 남아 보였다).

| 입력 | 기대 |
|---|---|
| 1, 2 누름 | 점 2개, 3번째 칸 커서, 버튼 비활성 |
| 1,2,3,4,5 | 4칸만, 5는 무시 |
| 키보드 "7" | 한 칸 입력 |
| 키보드 "a" | 무시 |
| 4자리 + Enter | 제출 |
| 서버 "현장 PIN 번호가 일치하지 않습니다." | WRONG 상태 |
| 서버 "현장 인증 PIN이 설정되지 않았습니다." | OTHER, 문구 그대로 |
| WRONG 상태에서 "3" 누름 | 오류 사라짐, 입력 "3" |
| WRONG 상태에서 Backspace | 오류 사라짐, 입력 비움 |
| "출석하기"에 포커스 + Enter | 제출 1회(창 keydown은 무시) |
| 서버 "시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요." | LOCKED, 문구 그대로, 입력 유지 |
| QR 출석 저장 중 "현장 출석 PIN 번호가 일치하지 않습니다." | (일어나지 않지만) 실패 화면 SAVE_FAILED |
| `classifyPinError('현장 PIN이 변경되었거나 일치하지 않습니다.')`(GAS) | `'WRONG'` |
| `classifyPinError('현장 출석 PIN 번호가 일치하지 않습니다.')` | `'WRONG'` |
| `classifyPinError('서버에 연결할 수 없어요')` | `'OTHER'` |

### R5. 실패 화면 (시안 `QRFail`)

`scanResult`를 `{ kind: 'GEO_FAILED' | 'OUT_OF_RANGE' | 'SAVE_FAILED', detail: string, … }`로 바꾼다. 공통 틀은 시안과 같다. 큰 원형 아이콘, 제목, 본문, 확인할 것 목록(`aria-label="확인할 것"`), 버튼 2개("다시 확인하기", "닫기")를 둔다. "다시 확인하기"는 지금처럼 `scanResult`를 비우고 같은 탭으로 돌아간다(`:531-534`). 이때 `pinError`도 비우고 위치 줄은 `idle`로 돌린다. "닫기"는 `onClose`다.

| 종류 | 언제 | 제목 | 본문 | 확인할 것 |
|---|---|---|---|---|
| `GEO_FAILED` | `acquirePosition` 실패(면제 아님, `:114-125`) | "위치를 확인하지 못했어요" | "연습실 안에서 위치 사용을 허용했는지 확인하고 다시 시도해 주세요." | 1. `detail`(= `describeGeoFailure` 또는 `GeoAcquireError.message`, 실패 이유별 기존 문구. 시안의 "휴대폰 설정에서 위치 사용이 켜져 있는지 확인해 주세요."를 이유별 문구로 바꾼 것) 2. "계속 안 되면 운영진에게 알려 주세요." |
| `OUT_OF_RANGE` | 반경 밖(`:130-148`) | "연습실 밖에서는 출석할 수 없어요" | "{장소}에서 {거리} 떨어져 있어요{꼬리}. 연습실에 도착한 뒤 다시 시도해 주세요." `{꼬리}` = `formatAccuracySuffix(accuracy)` | 1. "출석 인정 반경은 {반경}m예요." 2. "계속 안 되면 운영진에게 알려 주세요." |
| `SAVE_FAILED` | `addCheckInLog` 실패(PIN 불일치 제외, `:169-179`) | "출석을 저장하지 못했어요" | `detail`(서버 문구 그대로) | 1. "인터넷 연결을 확인하고 다시 시도해 주세요." |

- 아이콘: GEO·RANGE는 `IconLocationOff`(`--status-warning` 계열), SAVE는 `IconSync`(같은 색).
- 거리 표기는 지금 규칙 그대로다(1000m 이상이면 `x.xkm`, `:133-135`). 순수 함수 `formatDistance(m)`로 뺀다.
- 카카오톡 안이고 `needsExternalBrowserHint`이면 확인할 것 목록 아래에 기존 링크를 둔다(`:506-527` 문구와 동작 유지).

| 입력 | 기대 |
|---|---|
| 위치 권한 거부 | GEO_FAILED, 목록 1 = "위치 권한이 꺼져 있습니다. …" |
| 거리 1530m, 반경 150, 오차 30 | 본문 "제1연습실에서 1.5km 떨어져 있어요 (측정 오차 약 ±30m). 연습실에 도착한 뒤 다시 시도해 주세요.", 목록 1 "출석 인정 반경은 150m예요." |
| 거리 220m, 오차 모름 | "…220m 떨어져 있어요. 연습실에 도착한 뒤 다시 시도해 주세요." |
| 저장 중 네트워크 오류 | SAVE_FAILED, 본문 = 오류 문구 |
| PIN 출석 저장 중 PIN 불일치 | 실패 화면 아님, R4 WRONG |
| `formatDistance(999)` / `formatDistance(1000)` | "999m" / "1.0km" |

### R6. 완료 화면 (시안 `QRDone`)

- 아이콘은 원 안 체크(`--status-success`, 배경 `--status-success-light`). 제목은 "출석했어요"다. 사용자 결정으로 음표 이모지는 넣지 않는다.
- 본문은 "{이름} 단원님, {HH:mm}에 출석 처리됐어요."다. `{이름}` = `currentName`(명부 이름, `:68`. 지금 `:438`의 `profile.name`은 이름을 바꾼 회원이면 옛 이름이다). `HH:mm` = `getKSTClock(savedLog.timestamp)`.
- 목록 3줄: 일정 = **실제로 출석한 일정**(`targetSchedule.title`. 벽 QR이면 prop `schedule`과 다를 수 있다), 장소 = `resolveScheduleLocation(targetSchedule).locationName`, 출석 시각 = 위 `HH:mm`. `executeCheckIn` 안에서 일정 이름과 장소만 상태 `successInfo`로 저장한다(시각은 `savedLog`에서 계산, 원천을 둘로 만들지 않는다). 기존 `successTimeStr`는 지운다. 목록은 `aria-label="출석 내용"`.
- 버튼 "확인"과 머리의 닫기는 **둘 다** `handleFinishSuccess`(→ `onSuccess(log)`)다. 지금은 완료 뒤 닫기를 누르면 `onClose`가 불려 화면 새로고침(`triggerRefresh`, `App.tsx:514-517`)이 빠진다.
- 체크 그리기는 `IconCheck`(polyline, `pathLength` 없음)를 쓰지 않고, 시안처럼 `pathLength="1"`인 path SVG를 `CheckInResult.tsx` 안에 둔다. 장식 아이콘은 모두 `aria-hidden`.
- 진동·소리는 그대로다(`:181-188`).

| 입력 | 기대 |
|---|---|
| `log.timestamp` "2026-11-21 13:58:07" | "…13:58에 출석 처리됐어요.", 출석 시각 "13:58" |
| 벽 QR로 prop과 다른 일정 B에 출석 | 일정 줄 = B 이름, 장소 = B 장소 |
| 완료 화면에서 닫기 | `onSuccess` 호출(새로고침됨) |
| 명부 이름이 "이하은", 기기 연결 때 이름 "이하은(알토)" | "이하은 단원님, …" |

### R7. 움직임 (CSS만)

| 대상 | 움직임 |
|---|---|
| 스캔 줄 | 위아래 왕복 2초 |
| 네모 틀 | 숨쉬기(크기 1→1.035) 2.4초 |
| PIN 점 | 나타날 때 커짐 0.16초 |
| 커서 | 1초 깜박임 |
| 숫자 버튼 | 누를 때 0.94배 |
| WRONG | 칸 좌우 흔들림 0.45초 |
| 완료 | 원 튀어나옴 → 체크 그려짐 → 제목·본문·목록·버튼 순서대로 올라옴(시안 지연값) |
| 실패 | 원 튀어나옴 → 아이콘 한 번 흔들림 → 글자 올라옴 |

- `@media (prefers-reduced-motion: reduce)`이면 모두 멈춘다. 이때 체크는 처음부터 그려진 상태로 보인다(`stroke-dashoffset: 0`).
- JS 타이머로 움직이지 않는다. 라이브러리도 설치하지 않는다.

### R8. 스타일

- 새 파일 `src/styles/v3/checkin.css`를 만들고 클래스는 `ci-` 접두어로 쓴다. 색은 `src/index.css` 변수만 쓴다(규칙 8). 컴포넌트 안 인라인 hex와 그라디언트는 모두 지운다.
- 이모지·기호(🎵 🎉 ⚠️ 📷 📍 ⏰ ↺ ✕)는 모두 없앤다. 아이콘은 `Icons.tsx`만 쓴다. 검사 테스트는 `\p{Extended_Pictographic}`에 더해 `✕`(U+2715)·`↺`(U+21BA)를 직접 넣는다.
- 카메라 판 배경은 라이트·다크 모두 어두워야 한다. 기존 변수 중 가장 어두운 값(`--player-surface` 등, 고를 때 이유를 보고)을 쓰고, 없으면 `checkin.css` 안에서 `:root`와 **`.app-shell[data-theme='dark']`**(저장소 관례, `cssVariables.test.ts:215`) 짝으로 `--ci-camera-bg`를 정의한다.
- **상태 색(`--status-success/warning/danger`)은 아이콘·테두리·배경에만 쓰고 글자는 `--text-main`/`--text-sub`로 쓴다.** 다크 카드 위에서 `--status-danger`는 약 3.5:1, `--status-success`는 약 4.4:1이라 글자로는 4.5:1을 못 넘는다. `--status-*-light`는 다크 블록에 다시 정의돼 있지 않으니(`index.css:272-305`), 다크에서 쓸 배경은 `checkin.css`에 `.app-shell[data-theme='dark']` 범위로 둔다.
- 다크 모드에서 글자 대비 4.5:1 이상.

### R9. 파일 나누기 (규칙 9: 새 파일 400줄 이하)

| 파일 | 내용 |
|---|---|
| `QRScannerModal.tsx` | 상태, `executeCheckIn`, 카메라 effect(그대로), 화면 고르기 |
| `src/components/checkin/CheckInHeader.tsx` | 머리 + 일정 한 줄 + 탭 |
| `src/components/checkin/QrScanPanel.tsx` | 카메라 판(`videoRef`를 prop으로 받음), 카메라 실패 |
| `src/components/checkin/PinPad.tsx` | 4칸 + 숫자판 + 키보드 처리 + 버튼 |
| `src/components/checkin/CheckInResult.tsx` | 완료·실패 화면 |
| `src/components/checkin/GeoStatusLine.tsx` | 위치 줄 |
| `src/utils/checkinMessages.ts` | `classifyPinError`, `formatDistance`, `buildFailureView`, `geoStatusLabel` |
| `src/utils/pinPad.ts` | `nextPinState` |

`QRScannerModal.tsx`는 300줄 이하를 목표로 한다. 결과 줄 수를 보고한다.

---

## 4. 새 한글 문구 목록 (시안에서 온 것 + 시안에 없어 리뷰어가 정한 것)

| 문구 | 출처 |
|---|---|
| 출석 인증 | 시안 |
| QR 스캔 / 현장 PIN | 시안 |
| 현장 QR을 네모 안에 맞춰 주세요 | 시안 |
| 카메라가 안 열리거나 QR이 안 보이면 현장 PIN 탭을 눌러 주세요. | 시안 |
| 현장에 안내된 4자리 번호를 입력해 주세요. | 시안 |
| 출석하기 / 다시 입력해 출석하기 | 시안 |
| PIN이 맞지 않아요. 현장 안내의 번호를 다시 확인해 주세요. | 시안 |
| 위치 확인됨 | 시안 |
| 출석했어요 / {이름} 단원님, {HH:mm}에 출석 처리됐어요. / 일정 / 장소 / 출석 시각 / 확인 | 시안 |
| 위치를 확인하지 못했어요 / 연습실 안에서 위치 사용을 허용했는지 확인하고 다시 시도해 주세요. / 계속 안 되면 운영진에게 알려 주세요. / 다시 확인하기 / 닫기 | 시안 |
| 출석할 때 위치를 확인해요 / 위치 확인 중… / 위치 확인 생략 (비상 면제) | **리뷰어**(R2, 실제 상태 표시용) |
| 확인 중… / {n}자리 입력됨 / 지우기 / PIN 입력칸 | **리뷰어**(처리 중·화면 읽기용) |
| 연습실 밖에서는 출석할 수 없어요 / {장소}에서 {거리} 떨어져 있어요. 연습실에 도착한 뒤 다시 시도해 주세요. / (오차 약 ±{n}m) / 출석 인정 반경은 {반경}m예요. | **리뷰어**(시안에 반경 밖 화면 없음) |
| 출석을 저장하지 못했어요 / 인터넷 연결을 확인하고 다시 시도해 주세요. | **리뷰어**(시안에 저장 실패 화면 없음) |
| 카메라 실패 문구의 "[현장 PIN 번호]" → "[현장 PIN]", UNSUPPORTED 문구의 "아래" 삭제 | **리뷰어**(탭 이름·위치 맞춤) |
| 위치 확인됨 · 정확도 낮음 / 위치 확인됨 (비상 면제) | **리뷰어**(R2) |
| 접근성 이름: 인증할 일정 / 인증 방법 / 카메라 화면 / 출석 내용 / 확인할 것 / 닫기 / 출석 인증(dialog) | 시안(마지막만 리뷰어) |
| 장소 미정 | 기존 대체값 재사용 |

지우는 문구: "🎵 문콰이어 출석 체크", "인증에 성공했어요! 🎉", "…힘차고 즐겁게 시작해봐요! 🎵", "오늘 연습 힘차게 시작하기 🎵", "현장 위치 확인 실패", "다시 스캔 시도하기 ↺", "벽면의 QR 코드를 사각형 안에 비춰주세요", "카메라 QR 스캔", "현장 PIN 번호", "관리자가 공지한 현장 PIN 4자리", "* 연습실 반경 내에서만 PIN 출석이 유효합니다.", "현장 PIN으로 출석 완료", "위치 검증 및 출석 처리 중...", "4자리 PIN 번호를 모두 입력해주세요."(버튼 비활성으로 대신함).

---

## 5. 티켓 V3-23

**브랜치:** **PR #59 병합 뒤** `feat/checkin-ui`(`origin/main`에서). 커밋은 Y1~Y3 단위로 나누고 PR은 하나, Base는 `main`(`gh pr view`로 확인, 규칙 17).

### Y1. 순수 함수와 상태 모양
- `src/utils/checkinMessages.ts`: `classifyPinError`, `formatDistance`, `buildFailureView(kind, detail, ctx)` → `{title, body, tips}`, `geoStatusLabel(kind, accuracy)`.
- `QRScannerModal.tsx`: `geoStatus`·`scanResult`를 종류 값으로 바꾸고 `successInfo`를 추가한다. 동작 순서는 바꾸지 않는다.
- `geoPosition.ts`: "[현장 PIN 번호]" → "[현장 PIN]"(기존 테스트가 이 문구를 검사하면 함께 고친다).
- **테스트:** R2·R4·R5 표의 순수 함수 줄 전부(`geoStatusLabel`, `classifyPinError`, `nextPinState`, `formatDistance`, `buildFailureView`)와 R1 `formatCardDateLine` 빈 종료 시각. `formatDistance`는 수정 전 코드와 같은 결과인지 확인한다(999m·1000m·1530m·220m).

### Y2. 화면
- §3 R9 파일 나누기, R1~R7.
- `checkin.css`, `Icons.tsx`에 아이콘 3개 추가.
- 옛 `.viewfinder-*` CSS 정리(사용처 grep 결과를 보고).
- **테스트:** 이 저장소에는 jsdom이 없다(`renderToString`이나 `ScheduleDetailSheet.test.tsx`의 가짜 DOM 방식).
  - `PinPad`: 키 입력 → 표시 칸 수, 4자리 초과 무시, 숫자가 아닌 키 무시, WRONG 상태 뒤 숫자 입력 시 초기화. 상태 계산을 순수 함수 `nextPinState(state, key)`로 빼서 시험한다.
  - `CheckInResult`: 세 실패 종류와 완료의 제목·본문 글자를 `renderToString`으로 확인한다.
  - 이모지가 하나도 없는지 확인한다(`QRScannerModal.tsx`와 `checkin/` 아래 파일, R8 검사 방법).
  - **`QRScannerModal` 연결 테스트 4개**(가짜 DOM: `ScheduleDetailSheet.test.tsx:74-80`의 `clickNode`, `:296`의 `createRoot` 방식. 위치는 `navigator.geolocation`을 `vi.stubGlobal`, 서비스는 `vi.spyOn(sheetsService, 'verifyOnSitePin' | 'addCheckInLog')`):
    1. 처리 중 닫기 → `onClose` 안 불림
    2. PIN 출석 저장 중 "현장 출석 PIN 번호가 일치하지 않습니다." → PIN 탭 WRONG, 실패 화면 아님
    3. 완료 화면 닫기 → `onSuccess` 불림
    4. 반경 밖 → 실패 화면 → 다시 확인하기 → 위치 줄 "출석할 때 위치를 확인해요", `pinError` 없음
  - 회귀 기준: `App.test.tsx:291`(뒤로가기 때 카메라 끄기)이 그대로 통과.

### Y3. 확인
- `scripts/dev/capture-screens.mjs`(#59에서 늘린 Playwright `--home` 방식과 `capture-seed.mjs`)에 `--checkin` 장면을 추가해 아래 화면을 찍는다. 장마다 `scrollWidth`를 적는다.
  - 390×844: QR 탭(카메라 대신 실패 상태도 됨), PIN 2자리 입력, PIN WRONG, 완료, GEO_FAILED, OUT_OF_RANGE
  - 다크 모드: QR 탭, 완료
  - 1280×800: PIN 탭
  - 375×667: PIN 탭(버튼까지 닿는지)
- 헤드리스에서는 카메라와 위치를 Playwright `context.grantPermissions`와 `setGeolocation`으로 흉내 낸다. 그래도 안 되는 화면은 "미확인"과 이유를 적는다.
- `prefers-reduced-motion: reduce`로 완료 화면을 한 장 더 찍는다(체크가 그려져 있어야 함).

### 멈출 조건
- §2 표의 함수·행이 다르면 시작하지 않고 보고한다.
- §4에 없는 새 문구가 필요하면 멈추고 보고한다.
- 출석 저장 내용(`RawAttendanceLog` 필드), 위치·반경 판정, QR 해석을 바꿔야 할 것 같으면 멈추고 보고한다.
- 하지 않는 것: `supabase/` 변경, 운영 DB 실행, npm 설치, PR 머지, 배포, 열자마자 위치 재기(R2), 카메라 effect 블록(`:226-327`) 수정.
- **범위 밖 알려진 문제(고치지 말고 보고만):** `findActiveScheduleForMasterQR`(`src/utils/qr.ts:41-50`)은 정렬하지 않은 오늘 일정의 첫 번째를 고르고, 날짜를 기기 시간대로 계산하며, 보관·취소 일정을 거르지 않는다. 하루에 일정이 둘이면 벽 QR이 다른 일정에 기록될 수 있다.

### 보고
`docs/plans/17_v3_implementation_guide.md` §5 형식으로 쓴다. 새 한글 문구 목록은 이 문서 §4와 대조해 붙인다. `/report-ready`를 돌리고 CI 초록불을 확인한 뒤 보고하고 멈춘다.

---

## 6. spec-auditor 지적 반영 기록 (2026-11-24)

| 지적 | 반영 |
|---|---|
| B1 서버 문구 마이그레이션 위치 틀림 | 최신 정의(`security_hardening.sql:207-231`, `fix_onsite_pin_payload_key.sql:14-71`)로 교체 |
| S1 접근성 이름 누락 | §4 추가 |
| S2 `IconSync` 표 누락 | §2 추가 |
| S3 완료·실패 화면 머리 | 닫기만, R1 명시 |
| S4 키보드 중복 제출 | 처리 조건·무시 대상·ref 막기·예시 |
| S5 동작 변경 목록 | §1에 6개, PIN 출석만, `pinError` 근거 정정 |
| S6 위치 상태 | 면제 2종, 판정 뒤 상태, 돌아오면 idle |
| S7 일정 한 줄 | `formatCardDateLine` 재사용 + 빈 종료 시각 |
| S8 이름 원천 | `currentName` |
| S9 연결 테스트 | 4개 명시, 회귀 기준 |
| S10 화면 경계 | `100dvh`, safe-area, 375×667 |
| S11 다크 대비 | 상태 색은 아이콘·테두리만, 관례 선택자 |
| S12 겹치는 파일 | #59 병합 뒤 시작 |
| S13 오류 문구 전수 | `LOCKED` 추가, 예시 |
| S14 위치 줄 결정 | 사용자 확인 대기로 표시, 기본값 = 실제 상태 |
| 사소 N1~N12 | 정확도 꼬리 하나로, 괄호 겹침 해소, "아래" 삭제, 옛 CSS·허용 목록, 기호 검사, 체크 path, `successInfo` 시각 제외, Backspace 예시, 행 번호, 시안 팁 차이 명시, dialog, `pinPad.ts` |

### 오류 문구 전수 (verify·record 경로)

| 경로 | 문구 | 분류 |
|---|---|---|
| Supabase verify | "현장 PIN 번호가 일치하지 않습니다." | WRONG |
| Supabase verify | "현장 인증 PIN이 설정되지 않았습니다." | OTHER |
| Supabase verify·record | "시도 횟수가 너무 많습니다. QR로 출석하거나 15분 후 다시 시도해 주세요." | LOCKED |
| Supabase record | "현장 출석 PIN 번호가 일치하지 않습니다." | WRONG |
| 클라이언트 | "Supabase 통신 오류 (HTTP n)", "Supabase 서버 전송 실패"(`supabaseBackend.ts:69,97`) | OTHER |
| 클라이언트 | "현장 PIN을 시트에서 확인할 수 없습니다."(`sheets.ts:1573`), "현장 PIN이 누락되어…"(`:855`) | OTHER |
| GAS | "현장 PIN 번호가 일치하지 않습니다.", "현장 PIN이 변경되었거나 일치하지 않습니다." | WRONG |
