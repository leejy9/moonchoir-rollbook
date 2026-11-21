# check.md — v3-A(PR #27) 검수 후속 작업 지시서

> 대상: 개발 에이전트 · 작성: 리뷰어(Claude), 2026-11-21
> 기본 규칙은 [v3 개발 지시서](docs/plans/17_v3_implementation_guide.md) §1·§2(R1~R21)를 그대로 따른다.
> **이 문서는 작업이 모두 끝나면 마지막 커밋에서 삭제한다**(§4).

---

## 0. 검수 결과 요약

**리뷰어가 직접 확인해서 통과한 것**

| 항목 | 결과 |
|---|---|
| Green Bar | typecheck / lint 0 / test 600 통과 / build 통과 |
| 마이그레이션 `20261123000000_v3_media.sql` | 로컬 PostgreSQL 16에 전체 마이그레이션 순서대로 적용 성공. 두 번 실행해도 오류 없음. `v3_media_check.sql` 통과 |
| R3 (기존 함수 복사) | 3개 함수 모두 최신 정의 원본 대비 필요한 줄만 추가된 것 확인. 잘했다 |
| R7·R20·R21 | 정의 안 된 변수 0, 새 파일 400줄 이하, `index.css`는 토큰만 +29줄, `sheets.ts` +21줄 |
| Worker | 인증·형식·크기·키 형식·DELETE 정규식 구현과 테스트 확인 |

**반려 사유:** 운영진 연습곡 탭의 **저장 경로 버그 3개(데이터 손상 포함)**와 **기존 기능 회귀**가 있다. 단위 테스트는 통과하지만 실제 저장 결과를 검사하지 않아 못 잡았다(R10 위반).

---

## 1. 작업 환경

1. 브랜치: 기존 `feat/v3-member-ux`에서 이어서 작업한다. 푸시하면 PR #27에 반영된다.
2. 먼저 `git merge origin/main`으로 이 문서를 가져온다.
3. 커밋은 항목 하나에 하나. 메시지에 F번호를 넣는다.
4. **로컬에만 있는 `feat/v3-activity` 브랜치를 지금 원격에 푸시한다**(`git push -u origin feat/v3-activity`). 원격에 없으면 기기 문제로 v3-C 작업이 사라질 수 있다. 이 브랜치의 내용은 고치지 않는다.

---

## 2. 작업 목록

### F1. 악보 업로드가 항상 실패하고, 실패하지 않더라도 곡 정보를 지움 — P1

- **위치:** `src/components/admin/practice/MediaUploadSheet.tsx` 86행 근처 `saveFn`의 `kind === 'score'` 분기
- **현상:** `savePracticePiece({ id, title: '', scoreStorageKey, scoreSizeBytes })`를 보낸다.
  - `fn_save_practice_piece`는 빈 제목을 거부한다(`곡 제목은 필수입니다`). 그래서 저장이 항상 실패하고, 큐는 방금 올린 R2 객체를 지운다. 결과적으로 악보 업로드는 한 번도 성공할 수 없다.
  - 제목 검사가 없었다면 upsert가 `composer`, `arranger`, `score_url`, `notes`를 빈 값으로 덮어썼을 것이다.
- **수정:**
  - 저장 시점에 `sheetsService.getPracticeCatalog()`에서 해당 곡의 **최신 값**을 찾는다. 찾은 값을 펼친 뒤 `scoreStorageKey`, `scoreSizeBytes`만 바꿔서 보낸다.
  - 곡을 찾지 못하면 저장하지 않고 실패로 처리한다(새 키 삭제는 기존 큐 로직이 한다).
- **테스트:** 제목·작곡·편곡·`scoreUrl`·메모가 있는 곡에 악보를 올리면 `savePracticePiece`에 그 값들이 그대로 전달되는지 검사한다. 수정 전 코드에서 실패하는 것을 확인한다(R10).

### F2. 음원 "교체"가 새 트랙을 만들고 기존 트랙의 파일을 지움 — P1

- **위치:** `PieceTrackSection.tsx` 88행(`onOpenUpload(t.storageKey)`), `PieceEditModal.tsx`의 `uploadSheetTarget`, `MediaUploadSheet.tsx`의 audio `saveFn`
- **현상:** 교체 시 `previousStorageKey`만 넘기고 트랙 id는 넘기지 않는다. 그래서 `saveFn`이 id 없는 **새 트랙**을 만든다. 이어서 큐가 이전 키를 삭제하므로 기존 트랙은 지워진 파일을 가리키게 된다. 단원 화면에서 재생이 실패한다.
- **수정:**
  - 교체일 때는 `replaceTrackId`를 함께 넘긴다.
  - `saveFn`은 카탈로그에서 그 트랙의 최신 값을 펼친 뒤 `storageKey`, `sizeBytes`, `source: 'r2'`, (알 수 있으면) `durationSeconds`, `mimeType`만 바꿔 같은 id로 저장한다.
  - 이름과 종류는 사용자가 시트에서 바꾼 경우에만 바꾼다.
- **테스트:** 교체 후 `savePracticeTrack` 호출의 `id`가 기존 트랙 id와 같은지 검사한다. 새 트랙이 생기지 않는지, 저장 성공 후에만 이전 키 DELETE가 호출되는지도 검사한다.

### F3. 트랙 "보관"이 서버에 반영되지 않음 — P1

- **위치:** `PieceEditModal.tsx` 107행 `handleArchiveTrack`, `PieceTrackSection.tsx` 98·168행
- **현상:** `savePracticeTrack({...track, isArchived: true})`를 부른다. 하지만 `fn_save_practice_track`은 보관 여부를 저장하지 않는다(보관은 `fn_set_practice_track_archived` 담당). 화면에서는 잠깐 사라졌다가 새로고침하면 다시 나타난다.
- **수정:** 기존 `sheetsService.setPracticeTrackArchived(trackId, true)`를 쓴다. 이전 `AdminPracticeTab.tsx`(리뷰 기준 브랜치 188행)가 쓰던 방식이다.
- **테스트:** 보관 버튼이 `setPracticeTrackArchived`를 부르고 `savePracticeTrack`은 부르지 않는지 검사한다.

### F4. 기존 기능 회귀 복구 — P1

개편 전 `AdminPracticeTab.tsx`에 있던 기능 중 아래가 사라졌다. 명세 §4-1·§4-2에도 있는 기능이다.

| 기능 | 이전 코드(`origin/fix/review-followups` 기준) | 복구 위치 |
|---|---|---|
| 곡 보관 / 복원 | 109행 `setPracticePieceArchived` | 곡 편집 화면 하단 "보관" 버튼, 보관함 목록에서는 "복원" |
| 트랙 보관 해제(복원) | 188행 `setPracticeTrackArchived(id, !isArchived)` | 보관된 트랙은 곡 편집의 "보관된 트랙" 접힘 영역에 표시하고 "복원" 버튼 |
| 트랙 순서 바꾸기 | 212행 `reorderPracticeTracks` | 트랙 행의 ↑ 버튼과 ⋯ 메뉴 "아래로" (명세 §4-2) |
| 트랙 이름·종류 바꾸기 | 트랙 편집 폼 | ⋯ 메뉴 "이름 바꾸기", "종류 바꾸기". 저장은 F2처럼 최신 값을 펼쳐서 |

- **테스트:** 각 기능이 위 서비스 메서드를 올바른 인자로 부르는지 검사한다. 순서 바꾸기는 맨 위의 ↑, 맨 아래의 "아래로"가 비활성인지도 본다.

### F5. 새 트랙의 `orderIndex`가 항상 0 — P2

- **위치:** `MediaUploadSheet.tsx` audio `saveFn` (`orderIndex: 0`)
- **수정:** 같은 곡의 보관되지 않은 트랙 `orderIndex` 최댓값 + 1(없으면 0). 저장 시점의 최신 카탈로그 기준이다.

### F6. `youtu.be` 링크가 영상으로 분류되지 않음 — P2

- **위치:** `src/components/studio/PieceDetail.tsx` 31~32행, 운영진 목록의 음원·영상 개수 계산
- **현상:** `url.includes('youtube')`로 판별해서 `https://youtu.be/...` 링크(source가 youtube가 아닌 기존 데이터)는 음원 목록에 들어간다.
- **수정:** `src/utils/youtubeUrl.ts`의 검증 함수로 판별한다. `source === 'youtube'` 또는 URL이 유튜브 호스트면 영상이다. 같은 판별 함수를 단원 화면과 운영진 화면이 함께 쓴다.
- **테스트:** `youtu.be`, `m.youtube.com`, 구글 드라이브 링크 분류.

### F7. 쓰지 않는 컴포넌트 정리 — P2

- `src/components/TodayTab.tsx`, `CalendarTab.tsx`, `HomeView.tsx`가 이제 `App.tsx`에서 쓰이지 않는다(테스트에서만 import).
- **먼저 `grep -rn`으로 운영 코드에서 import하는 곳이 정말 없는지 확인한다.** 없으면 컴포넌트와 그 컴포넌트 전용 테스트 파일을 지운다. 이 경우에 한해 테스트 삭제를 허용한다(R9 예외).
- 그 안에서만 쓰이던 하위 컴포넌트·유틸이 있으면 같이 지우되, `HomeTab`이나 다른 곳이 쓰는 것은 남긴다.
- 지운 파일 목록과 확인한 grep 결과를 보고한다.

### F8. 원본 업로드 시 길이(`durationSeconds`) 저장 — P2

- 압축이 꺼져 있어(Q1 대기) 원본을 그대로 올리므로 트랙 길이가 비어 있다. 단원 화면에 `종류 · 길이`가 표시되지 않는다.
- **수정:** 업로드 전에 `URL.createObjectURL(file)`을 `new Audio()`에 넣고 `loadedmetadata`에서 `duration`을 읽는다. 끝나면 `URL.revokeObjectURL`.
  - 5초 안에 못 읽거나 `NaN` / `Infinity`면 비워 둔다.
  - 이 처리는 `src/services/media/audioMetadata.ts`(신규)에 둔다.
- **테스트:** 정상값, 시간 초과, `Infinity` 세 경우(오디오 요소는 가짜로 대체).

---

## 3. 보고 형식 보완

이번 PR 보고에는 V3-08·V3-09만 지시서 §5 형식으로 적혀 있다. 아래 내용을 이번 보고에 **V3-01·02·07·07b·03·04·05·06** 각각에 대해 추가한다.

- 사용한 기존 식별자 → 정의 위치(R1)
- 새 한글 문구 목록(R16)
- 수정 전 실패 출력 요약(R10)
- 새·수정 파일 줄 수(R20)

---

## 4. 마무리 (마지막 커밋)

1. `docs/DEV_LOG.md`에 F1~F8 요약(문제와 해결 한 줄씩)을 쓴다.
2. **이 파일 `check.md`를 삭제한다**(`git rm check.md`). 커밋 메시지: `docs: record v3-A review fixes (F1-F8) and remove check.md`
3. 푸시한다(PR #27에 반영). **머지하지 않는다.** 그 뒤 멈추고 보고한다.

## 5. 하지 말 것

- v3-B·v3-C 작업 시작
- `supabase/` 파일 수정(이번 수정은 DB 변경이 필요 없다. 필요하다고 판단되면 멈추고 보고)
- 운영 DB 실행·실행 요청, PR 머지, 배포
- 이 문서에 없는 리팩터링
