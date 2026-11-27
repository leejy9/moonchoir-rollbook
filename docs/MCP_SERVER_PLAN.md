# Moonchoir Rollbook — MCP (Model Context Protocol) Server Planning & Specification

> **문서 상태**: 설계 및 규격 정의 (RFC Draft)  
> **관련 문서**: [데이터 스키마](DATA_SCHEMA.md) · [에이전트 헌법](../AGENTS.md) · [PRD](PRD.md)

---

## 1. 개요 및 비전 (Overview & Vision)

### 1.1 배경 및 목적
문콰이어 출석부는 단원과 운영진이 모바일 웹에서 편리하게 출결과 일정을 관리할 수 있도록 구축되었습니다. 그러나 연습 일정, 워크숍, 연주회 준비 등 합창단 운영의 실제 의사결정은 총무단 단톡방이나 대화 속에서 이루어집니다.
**Moonchoir MCP Server(`moonchoir-mcp`)**는 Antigravity, Claude, Gemini 등 최신 AI LLM 에이전트가 문콰이어 출석부 시스템과 직접 통신하여, **자연스러운 대화만으로 복잡한 일정 체계와 대상자, 프로그램 카드를 완벽하게 조율하고 CRUD를 수행**할 수 있도록 하는 표준 인터페이스입니다.

### 1.2 핵심 철학
1. **대화형 의사결정 (Conversational Refinement)**: LLM이 사용자와 대화하며 모호한 조건을 질의하고, 필수 정보를 템플릿 규격에 맞춰 완성한 뒤 최종 승인을 거쳐 반영.
2. **도메인 불변식 준수 (Domain Invariants Preservation)**: MCP 도구를 통한 일정 생성/변경 역시 Supabase REST/Postgres 제약조건 및 감사 로그 체계를 100% 준수.
3. **완전한 맥락 상속 (Rich Context Inheritance)**: 상위 프로그램 카드(프로젝트)와 대상자(파트/개인), 장소 프리셋이 유기적으로 연결되는 구조화된 템플릿 제공.

---

## 2. MCP 서버 아키텍처 (System Architecture)

```
[ 사용자 / 마스터 ]
       │
       ▼ (자연어 대화: "다음 주 토요일 베이스 파트 연습 서초에 등록해줘")
[ LLM Client (Antigravity / Claude Desktop / Gemini) ]
       │
       ▼ (JSON-RPC 2.0 / MCP Protocol over stdio or SSE)
[ Moonchoir MCP Server (moonchoir-mcp) ]
  ├── 1. Tool Layer: schedule_create, schedule_update, program_card_link...
  ├── 2. Template Validator: 필수 필드 검증 및 기본값 상속 (Schema Enforcer)
  └── 3. API Adapter: Supabase REST RPC / Service Role Client
       │
       ▼ (HTTPS / Supabase PostgREST)
[ Moonchoir Database (Supabase / PostgreSQL) ]
```

---

## 3. 스케줄 정보 필수 템플릿 (Schedule Information Template Schema)

MCP 도구가 일정을 생성하거나 수정할 때, LLM이 통신단에서 반드시 채워야 하는 **정규 정보 템플릿(Standard Schedule Template)**입니다.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MoonchoirScheduleTemplate",
  "type": "object",
  "required": [
    "title",
    "date",
    "startTime",
    "endTime",
    "category",
    "location",
    "targetAudience"
  ],
  "properties": {
    "title": {
      "type": "string",
      "description": "일정 명칭 (예: 11월 정기연습, 헨델 메시아 파트연습)"
    },
    "date": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
      "description": "일정 날짜 (KST 기준 YYYY-MM-DD)"
    },
    "startTime": {
      "type": "string",
      "pattern": "^\\d{2}:\\d{2}$",
      "description": "시작 시각 (HH:mm, 24시간제)"
    },
    "endTime": {
      "type": "string",
      "pattern": "^\\d{2}:\\d{2}$",
      "description": "종료 시각 (HH:mm, 24시간제)"
    },
    "category": {
      "type": "string",
      "enum": ["정기연습", "추가연습", "파트연습", "연주회", "행사", "기타"],
      "description": "일정 구분 태그"
    },
    "programId": {
      "type": "string",
      "description": "소속 프로그램 카드 ID (선택: 없을 경우 단독 일정으로 생성)"
    },
    "location": {
      "type": "object",
      "required": ["name", "latitude", "longitude", "radiusMeters"],
      "properties": {
        "locationPresetId": { "type": "string", "description": "등록된 장소 프리셋 ID (우선 매핑)" },
        "name": { "type": "string", "description": "연습실/공연장 명칭" },
        "address": { "type": "string", "description": "도로명 주소" },
        "detailAddress": { "type": "string", "description": "상세 주소 (층/호수)" },
        "entranceNote": { "type": "string", "description": "오시는 길 / 출입 방법" },
        "latitude": { "type": "number", "description": "위도 (GPS)" },
        "longitude": { "type": "number", "description": "경도 (GPS)" },
        "radiusMeters": { "type": "number", "default": 100, "description": "출석 인증 반경(m)" }
      }
    },
    "targetAudience": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["ALL", "PARTS", "CUSTOM_MEMBERS"],
          "description": "대상자 범위 (ALL: 전체 단원, PARTS: 특정 파트, CUSTOM_MEMBERS: 지정 단원)"
        },
        "targetParts": {
          "type": "array",
          "items": { "type": "string", "enum": ["소프라노", "알토", "테너", "베이스", "선생님", "객원"] },
          "description": "type이 PARTS일 때 대상 파트 목록"
        },
        "targetMemberIds": {
          "type": "array",
          "items": { "type": "string" },
          "description": "type이 CUSTOM_MEMBERS일 때 대상 단원 고유 ID 목록"
        },
        "visibility": {
          "type": "string",
          "enum": ["ALL", "TARGETS_ONLY"],
          "default": "ALL",
          "description": "일정 노출 범위 (TARGETS_ONLY: 대상자에게만 캘린더에 노출)"
        }
      }
    },
    "recurrence": {
      "type": "object",
      "properties": {
        "frequency": { "type": "string", "enum": ["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"] },
        "count": { "type": "number", "description": "반복 회차 수" },
        "untilDate": { "type": "string", "description": "반복 종료일" }
      }
    },
    "checkInPin": {
      "type": "string",
      "pattern": "^\\d{4}$",
      "description": "당일 비상 인증용 4자리 숫자 PIN (미지정 시 자동 발급)"
    },
    "description": {
      "type": "string",
      "description": "연습 곡목, 준비물, 특이사항 안내"
    }
  }
}
```

---

## 4. MCP Tools 명세 (MCP Tool Declarations)

### Tool 1: `schedule_create`
새로운 연습 일정 또는 연속 회차 일정을 생성합니다.
- **Arguments**: `MoonchoirScheduleTemplate` 객체 (위 템플릿 규격)
- **동작**:
  1. `programId`가 지정된 경우, 해당 카드의 기본 장소/시간 상속 여부 대조.
  2. `locationPresetId`가 있을 경우 등록 장소의 좌표/반경 자동 채움.
  3. 반복 규칙(`recurrence`)이 있을 경우 `seriesId`를 발급하고 `seriesIndex` / `seriesTotal`을 계산하여 다중 회차 생성.
- **반환**: 생성된 일정 레코드 요약 및 ID.

### Tool 2: `schedule_list`
조건에 맞는 일정을 검색 및 조회합니다.
- **Arguments**:
  - `startDate` (선택, YYYY-MM-DD)
  - `endDate` (선택, YYYY-MM-DD)
  - `programId` (선택, 특정 프로그램 카드 소속만 필터링)
  - `category` (선택, 일정 구분)
  - `targetPart` (선택, 특정 파트가 대상인 일정)
  - `includeCancelled` (기본값 false)
- **반환**: 일정 목록 배열.

### Tool 3: `schedule_update`
기존 일정을 수정합니다.
- **Arguments**:
  - `scheduleId` (필수, 대상 일정 ID)
  - `patch` (수정할 속성 필드: 날짜, 시간, 장소, 대상자, 곡목 안내 등)
  - `updateSeries` (선택 boolean: 반복 일정일 경우 이후 모든 회차 일괄 변경 여부)
- **반환**: 수정 완료된 일정 상세.

### Tool 4: `schedule_delete`
일정을 취소하거나 영구 삭제합니다.
- **Arguments**:
  - `scheduleId` (필수)
  - `mode`: `"CANCEL"` (출석 통계 모수에서 안전하게 제외하고 로그 보존) 또는 `"HARD_DELETE"` (DB 완전 삭제)
  - `deleteSeries` (선택 boolean: 이후 회차 일괄 적용 여부)

### Tool 5: `program_card_manage`
프로그램 카드(프로젝트/시즌 컨테이너)를 조회, 생성, 수정합니다.
- **Arguments**:
  - `action`: `"CREATE" | "LIST" | "UPDATE" | "ARCHIVE"`
  - `card`: 카드 제목, 카테고리, 기본 장소, 기본 대상자 등.

### Tool 6: `location_preset_lookup`
등록된 연습실/공연장 프리셋 목록을 조회하여 장소 ID 및 좌표를 확인합니다.
- **Arguments**: `query` (선택: 장소명/주소 검색어)

---

## 5. 대화형 상호작용 시나리오 (Conversational Flow)

```
[총무단 / 사용자]
"다음 주 토요일에 베이스 파트 연습 일정 하나 잡아줘. 장소는 메인 연습실로 하고."

[LLM Agent via MCP]
1. `location_preset_lookup(query="메인 연습실")` 호출
   -> 서울시 서초구 메인 연습실 (ID: loc_main, 반경 100m, 좌표 확보)
2. `program_card_manage(action="LIST")` 호출
   -> 현재 진행 중인 '2026 하반기 정기연주회' 카드 식별
3. 사용자에게 부족한 필수 정보를 질문 (대화형 인터랙션):
   "다음 주 토요일(2026-11-28) 베이스 파트 연습 일정을 구성했습니다.
    - 장소: 서초 메인 연습실
    - 대상: 베이스 파트 한정
    - 현재 '2026 하반기 정기연주회' 프로젝트에 소속시킬까요?
    - 연습 시작/종료 시각은 어떻게 설정할까요? (기본값: 15:00 ~ 18:00)"

[사용자]
"응, 정기연주회 카드에 넣어주고 시간은 오후 2시부터 5시까지야."

[LLM Agent via MCP]
4. `schedule_create` 도구 호출
   {
     "title": "베이스 파트 특별연습",
     "date": "2026-11-28",
     "startTime": "14:00",
     "endTime": "17:00",
     "category": "추가연습",
     "programId": "card_2026_fall",
     "location": { "locationPresetId": "loc_main", ... },
     "targetAudience": { "type": "PARTS", "targetParts": ["베이스"] }
   }
5. 결과 피드백: "일정이 정상 등록되었습니다! 베이스 파트 단원들에게 해당 일정이 노출됩니다."
```

---

## 6. 개발 로드맵 (Milestones)

1. **Phase 1: MCP Tool Definition & JSON Schema (통신 템플릿 확립)**:
   - 본 문서의 템플릿 스키마를 TypeScript 타입 및 Zod 스키마로 선언.
2. **Phase 2: Moonchoir MCP Node Server 패키지 구성**:
   - `@modelcontextprotocol/sdk` 기반 경량 stdio/SSE 서버 구현.
   - Supabase Service Role Key 또는 마스터 인증 토큰을 환경 변수로 주입.
3. **Phase 3: Antigravity / Claude Desktop 등록 및 E2E 테스트**:
   - `claude_desktop_config.json` 및 Antigravity 에이전트 도구로 등록하여 자연어 일정 등록/조회 검증.
