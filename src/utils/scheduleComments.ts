import type { ScheduleComment, ScheduleCommentEvent } from '../types/rollbook';

/** 댓글 한 개의 최대 글자 수 */
export const COMMENT_MAX_LENGTH = 500;
/** 처음에 보여주는 최근 댓글 개수 (더 보기로 나머지를 연다) */
export const COMMENT_PAGE_SIZE = 50;

export function createCommentEventId(): string {
  return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 입력한 글을 저장 형태로 다듬는다. 검증에 실패하면 이유를 돌려준다. */
export function normalizeCommentText(raw: string): { text: string; error?: undefined } | { error: string; text?: undefined } {
  const text = raw.trim();
  if (!text) return { error: '댓글 내용을 입력해 주세요.' };
  if (text.length > COMMENT_MAX_LENGTH) return { error: `댓글은 ${COMMENT_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  return { text };
}

/**
 * 이벤트 로그(CREATE/EDIT/DELETE, 시트에 쌓인 순서)를 화면에 보여줄 댓글 목록으로 투영한다.
 * - 현재 내용은 가장 최근 EDIT(없으면 CREATE), DELETE가 있으면 숨긴다. 원본 이벤트는 바뀌지 않는다.
 * - 원본이 없는 EDIT·DELETE, 삭제된 뒤의 EDIT, 작성자가 아닌 사람의 EDIT·DELETE는 무시한다.
 * - `isSamePerson`으로 통합된 단원(별칭)을 같은 사람으로 본다.
 * - 결과는 쓴 순서(오래된 순)다.
 */
export function buildScheduleComments(
  events: ScheduleCommentEvent[],
  isSamePerson: (a: string, b: string) => boolean = (a, b) => a === b
): ScheduleComment[] {
  const byId = new Map<string, ScheduleComment>();
  const order: string[] = [];
  const deleted = new Set<string>();

  for (const event of events) {
    if (event.action === 'CREATE') {
      if (byId.has(event.id)) continue;
      byId.set(event.id, {
        id: event.id,
        scheduleId: event.scheduleId,
        memberId: event.memberId,
        memberName: event.memberName,
        part: event.part,
        text: event.text ?? '',
        createdAt: event.timestamp,
      });
      order.push(event.id);
      continue;
    }

    const targetId = event.targetId ?? '';
    const target = byId.get(targetId);
    if (!target || deleted.has(targetId)) continue;
    if (!isSamePerson(target.memberId, event.memberId)) continue;

    if (event.action === 'EDIT') {
      target.text = event.text ?? target.text;
      target.editedAt = event.timestamp;
    } else if (event.action === 'DELETE') {
      deleted.add(targetId);
    }
  }

  return order.filter((id) => !deleted.has(id)).map((id) => byId.get(id) as ScheduleComment);
}

/** `YYYY-MM-DD HH:mm:ss`에서 화면용 짧은 시각을 만든다(오늘이면 시:분, 아니면 월/일 시:분). */
export function formatCommentTime(timestamp: string, todayStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(timestamp);
  if (!match) return timestamp;
  const [, , month, day, hour, minute] = match;
  const date = `${match[1]}-${month}-${day}`;
  return date === todayStr ? `${hour}:${minute}` : `${Number(month)}/${Number(day)} ${hour}:${minute}`;
}
