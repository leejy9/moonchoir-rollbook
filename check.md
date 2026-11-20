# Moonchoir Rollbook — 2-Tier Admin & 보안 강화 코드 리뷰 및 질의서 (check.md)

> **문서 목적**: 다른 개발 에이전트가 작업한 2단계 관리자 분리(`SuperAdminDashboard`) 및 Phase 0 보안 강화(`security_hardening.sql`) 커밋에 대해, **실제 합창단 현장 운영 시 발생할 수 있는 마찰 지점과 의도를 확인하기 위해 작성된 공식 질의서**입니다.  
> **기준 커밋 범위**: `9c0cd96` → `HEAD` (`059e154`)  
> **작성일**: 2026-11-21  

---

## 📌 목차 및 요약 표

| 번호 | 검토 항목 | 핵심 요약 | 심각도 | 개발 의도 추정 |
| :---: | :--- | :--- | :---: | :--- |
| **Q1** | **현장 PIN 출석 파라미터 불일치** | 클라이언트는 `checkInPin` 전송, DB RPC는 `inputPin`만 확인 | 🚨 P0 | GAS 레거시 파라미터명과 Supabase RPC 파라미터명 간의 네이밍 차이 |
| **Q2** | **관리자 PIN 6자리 이상 강제 제한** | 사용자가 요청한 `1004`, `2315` 등 4자리 PIN이 DB/UI에서 거부됨 | 🚨 P0 | 저장소에 공개되었던 4자리 PIN 탈취 방지 및 무차별 대입 공격(Brute Force) 방어 |
| **Q3** | **비상 캐시 초기화 대상 키 불일치** | `sheetsStorage.ts`의 v3 키 대신 이미 폐기된 v1 키를 삭제함 | ⚠️ P1 | 과거 코드의 스토리지 키를 인용하여 작성됨 |
| **Q4** | **기기 바인딩 해제 RPC 미매핑** | `unbindMemberDevice` 액션이 `supabaseBackend.ts`에 없어 서버 반영 누락 | ⚠️ P1 | 1인 1기기 락 폐기 방침과 관리자 수동 연동 해제 기능 간의 설계 충돌 |
| **Q5** | **'이번 주' 날짜 계산 시 9시간 UTC 밀림** | `toISOString().slice(0, 10)` 사용으로 한국 기준 일요일로 날짜 왜곡 | 🟡 P2 | 자바스크립트 Date 기본 메서드 사용 시 KST(+9) 오프셋 누락 |
| **Q6** | **특정 개인 이름/전화번호 하드코딩** | `HomeView`와 `MemberPortalModal`에 특정 개인의 식별자가 직접 박힘 | 🟡 P2 | 특정 관리자의 운영 편의를 위한 임시 숏컷 제공 의도 |
| **Q7** | **모바일 터치 타깃 및 스크롤 오발동** | 44px 터치 타깃 미달(36px) 및 모바일 스크롤 중 롱프레스 오발동 가능성 | 🟡 P2 | 데스크톱 중심 미니 팝오버 스타일 적용 및 touchmove 캔슬 핸들러 누락 |

---

## 🔍 항목별 상세 분석 및 개발 에이전트 확인 질의

---

### [Q1] 현장 PIN 출석(`MANUAL_PIN`) 파라미터 불일치

#### 1. 현상 및 코드 근거
- **프론트엔드 (`src/services/sheets.ts` L536~538)**:
  ```typescript
  const result = await this.sendToGoogleSheet(
    'RECORD_ATTENDANCE',
    checkInPin ? { ...log, checkInPin } : log  // 👈 checkInPin 키로 전송
  );
  ```
- **Supabase RPC (`supabase/migrations/20261121000000_security_hardening.sql` L372~374, L396~397)**:
  ```sql
  v_input_pin text := p_payload->>'inputPin';  -- 👈 inputPin 키만 조회!
  ...
  if v_active_pin is null or trim(coalesce(v_input_pin, '')) = ''
     or trim(v_input_pin) <> trim(v_active_pin) then
    perform fn_auth_record_failure('activeOnSitePin');
    return jsonb_build_object('success', false, 'message', '현장 출석 PIN 번호가 일치하지 않습니다.');
  end if;
  ```
- **발생하는 문제**:
  - 단원이 모바일에서 현장 PIN을 정상 입력해도, 서버에서는 `p_payload->>'inputPin'`이 항상 `NULL`이 됩니다.
  - 결과적으로 모든 현장 PIN 출석 시도가 **"현장 출석 PIN 번호가 일치하지 않습니다."**로 거절되며, 60회 실패 시 15분간 잠김(Lockout) 상태가 됩니다.

#### 2. 개발 에이전트의 의도 추정
- Supabase RPC를 설계할 때 일반적인 입력값 명칭인 `inputPin`을 직관적으로 사용했고, 기존 프론트엔드가 GAS 시절부터 `checkInPin`이라는 프로퍼티명을 쓰고 있다는 점을 미처 교차 검증하지 못한 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"Supabase의 `fn_record_attendance`에서 현장 PIN을 검증할 때 `coalesce(p_payload->>'inputPin', p_payload->>'checkInPin')`으로 양쪽 키를 모두 허용하도록 수정해도 괜찮을까요? 아니면 클라이언트 페이로드를 `inputPin`으로 일원화하는 것을 의도하셨나요?"**

---

### [Q2] 관리자 PIN 길이 6자리 이상 강제 제한 (`1004`, `2315` 거부)

#### 1. 현상 및 코드 근거
- **Supabase RPC (`20261121000000_security_hardening.sql` L156~158, L190~192)**:
  ```sql
  -- Old 4-digit PINs were published in the repository: refuse them until rotated.
  if length(trim(v_real_pin)) < 6 then
    return jsonb_build_object('success', false, 'message', '보안 업데이트로 관리자 PIN 교체가 필요합니다. 시스템 소유자에게 문의해 주세요.');
  end if;
  ```
- **프론트엔드 UI (`src/components/admin/SuperAdminDashboard.tsx` L260, L280)**:
  ```typescript
  if (!val || val.length < 6 || val.length > 8) {
    showError('운영진 PIN은 6~8자리 숫자여야 합니다.');
    return;
  }
  ```
- **발생하는 문제**:
  - 사용자는 **일반 운영진 PIN은 기존 `1004`를 유지**하고, **최고 관리자 PIN은 `2315`로 진입**하기를 원하고 있습니다.
  - 현재 코드는 6자리 미만 PIN에 대해 DB와 UI 양쪽에서 로그인을 원천 차단하고 있어, 사용자가 원하는 4자리 PIN을 사용할 수 없습니다.

#### 2. 개발 에이전트의 의도 추정
- 주석에 명시된 대로(`Old 4-digit PINs were published in the repository`), 과거 git 커밋 기록에 `1004`, `2315` 등의 4자리 번호가 평문으로 남아 있어 보안상 무차별 대입 공격에 취약하다고 판단하여, 엔터프라이즈 보안 기준(최소 6자리)을 적용한 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"보안 취약점 방지를 위해 6자리 이상을 권장한 취지는 충분히 이해됩니다. 다만 현재 합창단 운영진이 친숙하게 사용하던 `1004` 및 최고 관리자 `2315`를 그대로 사용하고자 하는데, 4자리 PIN도 허용하도록 `length < 4`로 완화하는 것에 대해 어떻게 생각하시나요? (시도 횟수 제한 15분 락 기능이 이미 있으므로 4자리도 일정 수준 방어가 가능합니다.)"**

---

### [Q3] 최고 관리자 화면의 '비상 캐시 초기화' 키 불일치

#### 1. 현상 및 코드 근거
- **`src/components/admin/SuperAdminDashboard.tsx` L186~188**:
  ```typescript
  const keys = ['moonchoir_schedules', 'moonchoir_members_v1', 'moonchoir_logs_v1', 'moonchoir_rsvp_votes_v1'];
  keys.forEach((k) => localStorage.removeItem(k));
  window.location.reload();
  ```
- **실제 활성 스토리지 키 (`src/services/sheetsStorage.ts` L1~10)**:
  ```typescript
  export const STORAGE_KEYS = {
    MEMBERS: 'moonchoir_members_v3',
    SCHEDULES: 'moonchoir_schedules_v3',
    RSVP_VOTES: 'moonchoir_rsvp_votes_v3',
    LOGS: 'moonchoir_logs_v3',
    CONFIG: 'moonchoir_config_v3',
    LOCATIONS: 'moonchoir_locations_v3',
    PROGRAM_CARDS: 'moonchoir_program_cards_v3',
    COMMENTS: 'moonchoir_comments_v3',
  } as const;
  ```
- **발생하는 문제**:
  - 관리자가 비상 캐시 초기화를 클릭해도 실제 `v3` 데이터는 전혀 지워지지 않고, 페이지가 새로고침되어도 오래된 캐시가 그대로 유지됩니다.

#### 2. 개발 에이전트의 의도 추정
- 초기 개발 당시의 구버전 키 이름을 참조하여 수동 삭제 로직을 작성하면서, `sheetsStorage.ts`에 이미 존재하는 `resetStorage()` 함수를 확인하지 못한 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"비상 캐시 초기화 시 `sheetsStorage.ts`에 선언된 공식 `resetStorage()` 함수를 호출하여 현재 활성화된 모든 `v3` 로컬 캐시를 일괄 비우도록 교체해도 괜찮을까요?"**

---

### [Q4] 최고 관리자 화면의 '기기 바인딩 해제' Supabase 미반영

#### 1. 현상 및 코드 근거
- **`SuperAdminDashboard.tsx` L200**:
  ```typescript
  await sheetsService.unbindMemberDevice(memberId);
  ```
- **`src/services/sheets.ts` L894**:
  ```typescript
  const result = await this.sendToGoogleSheet('UNBIND_DEVICE', { memberId });
  ```
- **`src/services/backend/supabaseBackend.ts` L93~145 (`mapActionToRpc`)**:
  - `'UNBIND_DEVICE'` 액션 매핑이 누락되어 있음.
  - `mapActionToRpc`가 `null`을 반환하고 콘솔에 경고만 찍은 뒤 `{ success: true, message: 'RPC 미매핑 (스킵)' }`으로 서버 통신을 건너뜀.
- **발생하는 문제**:
  - 관리자가 기기 연동을 해제하면 로컬 상태만 잠깐 풀리고, Supabase DB의 `members` 테이블 `bound_device_id`는 삭제되지 않아 새로고침 시 다시 연동된 상태로 원복됩니다.

#### 2. 개발 에이전트의 의도 추정
- 이전 Supabase 전환 계획(`15_supabase_migration_plan.md`)에서 1인 1기기 강제 락을 지양하기로 합의하면서 `UNBIND_DEVICE`를 백엔드에서 뺐으나, 이번에 새로 구축된 `SuperAdminDashboard`에서 단원 지원(Trouble Doctor) 목적으로 수동 기기 해제 UI를 추가하면서 Supabase 어댑터 연결을 누락한 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"최고 관리자 화면에서 특정 단원의 기기 바인딩을 강제 해제할 수 있도록, Supabase의 `fn_update_member` 또는 전용 RPC를 통해 `bound_device_id`를 `null`로 초기화하도록 백엔드 어댑터에 매핑을 추가해도 괜찮을까요?"**

---

### [Q5] 감사 로그 '이번 주' 필터링 시 9시간 UTC 날짜 왜곡

#### 1. 현상 및 코드 근거
- **`src/components/admin/SuperAdminDashboard.tsx` L305~312**:
  ```typescript
  const mon = new Date(d);
  mon.setDate(d.getDate() - diffToMonday);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10), // 🚨 한국 월요일 00:00 KST -> 일요일 15:00 UTC로 변환됨!
    end: sun.toISOString().slice(0, 10),
  };
  ```
- **발생하는 문제**:
  - 자바스크립트의 `.toISOString()`은 무조건 영국 그리니치(UTC) 시간으로 변환합니다.
  - 한국 시간(KST, UTC+9) 월요일 00시는 UTC 기준 **일요일 오후 3시**가 되므로, `.toISOString().slice(0, 10)`을 하면 **일요일 날짜 문자열**이 반환되어 이번 주 범위가 하루씩 앞으로 밀립니다.

#### 2. 개발 에이전트의 의도 추정
- 날짜를 `YYYY-MM-DD` 포맷으로 쉽게 자르기 위해 흔히 쓰이는 `.toISOString().slice(0, 10)`을 무심코 사용한 표준적인 시간대 오프셋 버그입니다.

#### 3. 질문 (Clarification Question)
> **"이미 프로젝트에 존재하는 한국 시간 전용 유틸인 `getKSTDateString(mon)` 및 `getKSTDateString(sun)`을 사용하여 KST 기준 월~일요일로 정확히 계산하도록 수정해도 괜찮을까요?"**

---

### [Q6] 특정 개인의 이름/전화번호 하드코딩 안티패턴

#### 1. 현상 및 코드 근거
- **`src/components/HomeView.tsx` L168~178 & `MemberPortalModal.tsx` L66~76**:
  ```typescript
  const isStaffAdmin = useMemo(() => {
    return (
      currentMember.role === 'ADMIN' ||
      currentMember.memberStatus === '선생님' ||
      currentMember.memberStatus === '운영진' ||
      currentMember.name === '이재현' ||      // 🚨 특정 개인 식별자 하드코딩
      currentMember.phoneLast4 === '2440' ||  // 🚨 특정 개인 식별자 하드코딩
      profile.name === '이재현' ||
      profile.phoneLast4 === '2440'
    );
  }, [currentMember, profile]);
  ```
- **발생하는 문제**:
  - 소스코드에 특정 개인의 이름과 전화번호 뒷자리가 박혀 있어, 총무나 파트장이 바뀌었을 때 유지보수가 불가능해지며 역할 기반 권한 모델(RBAC)을 위반합니다.

#### 2. 개발 에이전트의 의도 추정
- 개발 및 테스트 과정에서 특정 관리자가 손쉽게 관리자 진입 버튼을 볼 수 있도록 디버깅 편의를 위해 임시로 넣어둔 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"하드코딩된 개인 이름/전화번호 조건을 제거하고, 순수하게 `currentMember.role === 'ADMIN'` 또는 `currentMember.memberStatus === '운영진'/'선생님'` 등 데이터베이스의 권한 필드만으로 판단하도록 정리해도 괜찮을까요?"**

---

### [Q7] 모바일 터치 타깃 불변식(44px) 위반 및 스크롤 시 이스터에그 오발동

#### 1. 현상 및 코드 근거
- **`src/components/HomeView.tsx` L98~118, L540**:
  - 로고 `onTouchStart` 시 600ms 타이머가 작동하지만, `onTouchMove` 핸들러가 누락되어 있습니다.
  - 모바일에서 출석부를 보려고 손가락으로 화면을 아래로 스크롤할 때, 손가락이 로고 위를 스치면서 600ms가 지나면 스크롤 도중 이스터에그 팝오버가 튀어나옵니다.
  - `Get in` 미니 팝오버 버튼 높이가 `minHeight: 36px`로 되어 있어, 모바일 터치 타깃 최소 44px 불변식을 위반합니다.

#### 2. 개발 에이전트의 의도 추정
- 로고 우측 하단에 뜨는 메뉴를 시각적으로 작고 은밀하게 보이게 하려고 `minHeight: 36px`를 적용했고, 모바일 터치 스크롤 이벤트 취소(`touchmove`)를 미처 챙기지 못한 것으로 보입니다.

#### 3. 질문 (Clarification Question)
> **"화면 스크롤 시 손가락 움직임이 감지되면 롱프레스 타이머를 즉시 취소(`onTouchMove`, `onTouchCancel`)하고, 모바일 현장 터치 타깃을 44px로 확보하도록 약간의 패딩 조정을 진행해도 괜찮을까요?"**

---

## 💡 결론 및 다음 단계 제안

현재 구현된 전체적인 아키텍처(2단계 관리자 분리, 감사 로그 그리드, 비상 GPS 면제, 토큰 기반 보안 세션)는 매우 훌륭합니다.

다만 위의 **Q1(현장 PIN 출석 불가)**과 **Q2(사용자 요청 PIN 거부)**는 **실제 연습 현장에서 즉각적인 기능 마비**를 초래하므로 반드시 의도를 조율하고 수정해야 합니다. 

위 내용을 다른 에이전트에게 공유하시고 답변을 받아오시면, 그 의도에 맞추어 가장 안전하고 완벽하게 코드를 보완해 드리겠습니다!
