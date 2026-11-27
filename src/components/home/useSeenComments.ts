import { useSeenState } from '../../services/seenStateStore';
import { sheetsService } from '../../services/sheets';
import type { Schedule } from '../../types/rollbook';
import { isCommentUnread } from '../../utils/seenState';

export interface SeenCommentsView {
  /** 일정별 새 댓글 여부 */
  hasNewComment: (scheduleId: string) => boolean;
}

/**
 * 홈 카드용 새 댓글 계산. 계정별 서버 읽음 기록(`seenStateStore`)만 쓴다.
 */
export function useSeenComments(
  memberId: string,
  schedules: readonly Schedule[],
  isReady: boolean,
  refreshKey?: number
): SeenCommentsView {
  void refreshKey;
  const seenState = useSeenState();

  const newByScheduleId = new Map<string, boolean>();
  if (isReady && seenState.status === 'ready' && seenState.seen) {
    for (const schedule of schedules) {
      const comments = sheetsService.getComments(schedule.id);
      const hasUnread = comments.some((c) =>
        isCommentUnread(c, seenState.seen, sheetsService.isOwnComment(c, memberId))
      );
      if (hasUnread) {
        newByScheduleId.set(schedule.id, true);
      }
    }
  }

  return { hasNewComment: (scheduleId) => newByScheduleId.get(scheduleId) === true };
}
