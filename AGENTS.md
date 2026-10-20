# Moonchoir Rollbook — Agent Constitution & System Harness

## 0. 비판적 파트너십 (Critical Partnership)
- 상위 워크스페이스 규칙([critical_partnership.md](file:///Users/grasshop/Desktop/Antigravity/.agents/rules/critical_partnership.md))을 준수한다.
- 무조건적인 칭찬과 맹목적 동조를 절대 금지한다.
- 사용자의 아이디어나 아키텍처 제안에 대해 컴퓨팅 비용, 데이터 오염 위험, 유지보수 마찰, 엣지 케이스를 먼저 검토하고 담백하게 피드백한다.

## 1. 도메인 불변식 (Core Data Invariants)
- **Append-Only 원천 로그 분리 (Event Sourcing)**:
  - QR/PIN으로 기록되는 출석 체크는 반드시 "원천 타임스탬프 로그(Raw Check-in Log)" 형태로 추가(Append)만 수행한다.
  - 원천 로그는 과거 기록을 덮어쓰거나(In-place update) 삭제하지 않는다.
  - 출석/지각/결석/공가 판정 및 통계 대시보드는 원천 로그를 바탕으로 계산되는 '투영 뷰(Projection View)'로 동작해야 하며, 통계 로직이 바뀌더라도 원천 데이터는 영구히 보존되어야 한다.
- **스키마 하위 호환성 (Schema Evolution & Backward Compatibility)**:
  - 새로운 속성이나 열(Column)이 추가되어도, 기존 데이터 행/열을 '이상치'나 '구버전'으로 간주하여 필터링하거나 임의 삭제하지 않는다.
  - 필드가 누락된 과거 레코드는 안전한 기본값(Fallback)을 적용하는 어댑터를 통해 온전히 로드한다.
  - 구글 시트 컬럼은 순서(Index)가 아닌 고유 헤더 키(Header Key) 기반으로 안전하게 파싱한다.
- **동적 메타데이터 보존 (Configurable Taxonomy)**:
  - 파트(소프라노, 알토, 테너, 베이스, 선생님, 객원 등), 출결 상태(출석, 지각, 결석, 병가, 공가 등), 일정 구분(정기연습, 추가연습, 연주, 녹음 등)은 코드 내 하드코딩된 enum으로 닫아두지 않는다.
  - 관리자가 설정에서 자유롭게 추가/수정할 수 있어야 하며, "기타(직접입력)" 같은 예외 문자열이 들어와도 파싱 에러 없이 원문 그대로 보존해야 한다.

## 2. 행동 경계선 (Boundaries)
- **NEVER**:
  - 구글 시트의 기존 탭(Tab)이나 1행 헤더를 스크립트로 임의 삭제/덮어쓰기 금지.
  - 사전 승인 없이 거대한 서드파티 라이브러리 `npm install` 금지 (경량/브라우저 표준 우선).
  - 인증 시크릿(Google Service Account Key, API Key 등)을 깃이나 클라이언트에 직접 노출 금지.
  - `package-lock.json` 수동 편집 금지.
- **ALWAYS**:
  - 구글 시트 API 통신 로직은 UI 컴포넌트와 분리된 단일 어댑터(`services/sheets.ts`)를 통해서만 호출.
  - 모바일 터치 타깃 최소 44px 이상 유지 (합창 연습 현장에서 스마트폰으로 손쉽게 출석 체크 및 대시보드 열람 보장).
  - 작업 완료 보고 전 반드시 결정론적 센서(Green Bar: `npm run typecheck`, `npm run lint`, `npm test`) 통과할 것.
- **ASK FIRST**:
  - 구글 시트의 원천 스키마(새로운 필수 열 추가 등) 구조를 변경할 때는 사용자에게 사전 확인.

## 3. 기술 스택 & 결정론적 명령어 (Tech Stack & Exact Commands)
- **Frontend Core**: Vite + React 19 + TypeScript
- **Styling**: Vanilla CSS (모바일 우선 반응형 설계)
- **QR Engine**: `qrcode.react` (클라이언트 사이드 동적 SVG 렌더링)
- **Location Verification**: Browser Native Geolocation (`src/utils/geo.ts` - Haversine 공식 기반)
- **Backend/Storage**: Google Sheets (Google Apps Script Web App 연동)

### Exact CLI Commands
- 개발 서버 실행: `npm run dev`
- 정적 타입 체크: `npm run typecheck`
- 린터 검사: `npm run lint`
- 전체 단위 테스트: `npm test`
- 단일 테스트 격리 실행: `npm test -- -t "<테스트명>"`
- 프로덕션 빌드: `npm run build`

## 4. 디렉터리 레이아웃 (Repository Layout)
```
Moonchoir_rollbook/
├── AGENTS.md               # 에이전트 헌법 및 시스템 하네스 (SSOT)
├── src/
│   ├── components/         # 모바일 반응형 UI 컴포넌트 (QR 모달, 키패드, 대시보드)
│   ├── services/           # 구글 시트 API 어댑터 (sheets.ts)
│   ├── types/              # 도메인 모델 및 데이터 계약 인터페이스 (rollbook.ts)
│   ├── utils/              # 하버사인 거리 계산(geo.ts), 날짜/시간 포맷터
│   ├── App.tsx             # 루트 앱
│   └── main.tsx            # 엔트리포인트
├── package.json
└── tsconfig.json
```

## 5. 기능/데이터 추가 시 4단계 레시피 (Feature Recipe)
1. `types/`: 데이터 스키마 및 인터페이스 정의
2. `services/`: 시트 파서 및 데이터 어댑터 작성 (하위 호환성 기본값 검증)
3. `ui/`: 모바일 터치 친화적 컴포넌트 구현
4. `verify`: 단일 단위 테스트(`npm test -- -t "..."`) 및 `typecheck` 통과 후 완료 보고

## 6. 구조 복구 작업 시 필수 참고 문서
- 데이터 저장, Google Sheets 동기화, 회원 병합, 출석 기록을 조사하거나 수정하기 전 [구조 복구 기록](docs/ARCHITECTURE_RECOVERY.md)을 읽는다.
- 해당 기록은 확인된 현재 동작과 사용자 합의 사항을 구분한다. 새 사실이나 결정이 확인되면 함께 갱신한다.
- PRD는 원하는 제품 동작을 정의하고, 구조 복구 기록은 현재 코드와의 차이 및 변경 근거를 기록한다. 둘이 다르면 임의로 추정하지 말고 차이를 사용자와 확인한다.
