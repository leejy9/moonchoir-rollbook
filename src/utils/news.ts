import type {
  Member,
  NewsItem,
  ReactionEmoji,
  RSVPVote,
  Schedule,
  ScheduleComment,
} from '../types/rollbook';
import type { CommentReactionMap } from './commentReactions';
import type { MergedSeenState } from './seenState';
import type { EvaluatedSticker } from './praiseStickerDefinitions';
import { addDaysKST, getKSTDateString } from './date';
import { parseServerTimeMs } from './serverTime';
import { resolveMemberIdentity } from './memberIdentity';
import { findMyVote } from './myVote';
import { isRsvpOpenForSchedule, parseScheduleKST, RSVP_CUTOFF_BEFORE_MIN } from './timeWindow';
import { isMemberRequiredForSchedule } from './attendanceStats';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function withObjectParticle(name: string): string {
  if (!name) return '을(를)';
  const code = name.charCodeAt(name.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0 ? `${name}을` : `${name}를`;
  }
  return `${name}을(를)`;
}

function getKSTParts(ms: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const kst = new Date(ms + 9 * 3600_000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

export function formatRelativeKST(atMs: number, nowMs: number): string {
  if (Number.isNaN(atMs)) return '';
  const diff = Math.max(0, nowMs - atMs);
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;

  const atDate = getKSTDateString(new Date(atMs));
  const nowDate = getKSTDateString(new Date(nowMs));
  if (atDate === nowDate && diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}시간 전`;
  }
  if (atDate === addDaysKST(nowDate, -1)) {
    return '어제';
  }
  const { month, day } = getKSTParts(atMs);
  return `${month}월 ${day}일`;
}

function formatScheduleDateLabel(dateStr: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!parts) return dateStr;
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const weekday = WEEKDAYS_KO[kst.getUTCDay()];
  return `${Number(parts[2])}월 ${Number(parts[3])}일 ${weekday}`;
}

function formatDeadlineKST(ms: number): string {
  const { month, day, hour, minute } = getKSTParts(ms);
  return `${month}월 ${day}일 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatStickerDateLabel(earnedOn: string | undefined, nowMs: number): string {
  if (!earnedOn) return '';
  const todayStr = getKSTDateString(new Date(nowMs));
  if (earnedOn === todayStr) return '오늘';
  if (earnedOn === addDaysKST(todayStr, -1)) return '어제';
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(earnedOn);
  if (!parts) return earnedOn;
  return `${Number(parts[2])}월 ${Number(parts[3])}일`;
}

function truncateCommentPreview(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 20) return clean;
  return `${clean.slice(0, 20)}…`;
}

export interface BuildNewsItemsInput {
  currentMember: Member;
  aliasIds: Set<string>;
  canonicalId: string;
  members: Member[];
  schedules: Schedule[];
  getComments: (scheduleId: string) => ScheduleComment[];
  reactions: CommentReactionMap;
  rsvpVotes: RSVPVote[];
  evaluatedStickers: EvaluatedSticker[];
  seen: MergedSeenState | null;
  nowMs: number;
  windowDays: number;
}

export interface BuildNewsItemsResult {
  unread: NewsItem[];
  read: NewsItem[];
}

export function buildNewsItems(input: BuildNewsItemsInput): BuildNewsItemsResult {
  const {
    currentMember,
    aliasIds,
    canonicalId,
    members,
    schedules,
    getComments,
    reactions,
    rsvpVotes,
    evaluatedStickers,
    seen,
    nowMs,
    windowDays,
  } = input;

  if (!seen || Number.isNaN(seen.baseline)) {
    return { unread: [], read: [] };
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const minWindowMs = nowMs - windowDays * 86_400_000;
  const newsThreshold = Math.max(seen.baseline, Number.isNaN(seen.news) ? -Infinity : seen.news);
  const nowDate = new Date(nowMs);

  const unread: NewsItem[] = [];
  const read: NewsItem[] = [];

  const isMyId = (id: string) => {
    if (aliasIds.has(id)) return true;
    const cid = resolveMemberIdentity(id, members).canonicalId;
    return cid === canonicalId || aliasIds.has(cid);
  };

  const getMemberName = (id: string) => {
    const cid = resolveMemberIdentity(id, members).canonicalId;
    return memberById.get(cid)?.name ?? memberById.get(id)?.name ?? '단원';
  };

  for (const schedule of schedules) {
    const comments = getComments(schedule.id);
    const scheduleCommentsSeen = seen.comments.get(schedule.id);
    const commentThreshold =
      scheduleCommentsSeen !== undefined && !Number.isNaN(scheduleCommentsSeen)
        ? Math.max(newsThreshold, scheduleCommentsSeen)
        : newsThreshold;

    // 1. Reaction news (on my non-deleted comments, by others)
    for (const comment of comments) {
      if (!isMyId(comment.memberId)) continue;
      const byEmoji = reactions.get(comment.id);
      if (!byEmoji) continue;

      // For each other member currently active on this comment, find their latest ADD ms & emoji
      const memberLatest = new Map<string, { at: number; emoji: ReactionEmoji }>();
      for (const [emoji, bucket] of byEmoji.entries()) {
        for (const [reactorId, atMs] of bucket.memberAt.entries()) {
          if (isMyId(reactorId)) continue;
          if (Number.isNaN(atMs) || atMs < minWindowMs) continue;
          const prev = memberLatest.get(reactorId);
          if (!prev || atMs > prev.at) {
            memberLatest.set(reactorId, { at: atMs, emoji });
          }
        }
      }

      if (memberLatest.size === 0) continue;

      let latestReactorId = '';
      let latestAt = -Infinity;
      let latestEmoji: ReactionEmoji = '👍';
      for (const [reactorId, info] of memberLatest.entries()) {
        if (info.at > latestAt) {
          latestAt = info.at;
          latestReactorId = reactorId;
          latestEmoji = info.emoji;
        }
      }

      const latestName = getMemberName(latestReactorId);
      const count = memberLatest.size;
      const title =
        count === 1
          ? `${latestName} 님이 내 댓글에 ${latestEmoji} 반응했어요`
          : `${latestName} 님 외 ${count - 1}명이 내 댓글에 반응했어요`;
      const sub = `"${truncateCommentPreview(comment.text)}" · ${schedule.title} · ${formatRelativeKST(latestAt, nowMs)}`;

      const item: NewsItem = {
        key: `reaction:${comment.id}`,
        kind: 'reaction',
        at: latestAt,
        title,
        sub,
        target: { type: 'schedule', scheduleId: schedule.id },
        scheduleId: schedule.id,
      };
      if (latestAt > newsThreshold) {
        unread.push(item);
      } else {
        read.push(item);
      }
    }

    // 2. @Mention news (comments mentioning me, written by others)
    const mentionedCommentIds = new Set<string>();
    for (const comment of comments) {
      if (isMyId(comment.memberId)) continue;
      const mentions = comment.mentionMemberIds ?? [];
      if (!mentions.some((id) => isMyId(id))) continue;

      let mentionedAtStr: string | undefined;
      if (comment.mentionedAt) {
        for (const [mid, ts] of Object.entries(comment.mentionedAt)) {
          if (isMyId(mid)) {
            mentionedAtStr = ts;
            break;
          }
        }
      }
      const atMs = parseServerTimeMs(mentionedAtStr);
      if (Number.isNaN(atMs) || atMs < minWindowMs) continue;

      mentionedCommentIds.add(comment.id);
      const authorName = getMemberName(comment.memberId);
      const item: NewsItem = {
        key: `mention:${comment.id}`,
        kind: 'mention',
        at: atMs,
        title: `${authorName} 님이 댓글에서 나를 언급했어요`,
        sub: `"${truncateCommentPreview(comment.text)}" · ${schedule.title} · ${formatRelativeKST(atMs, nowMs)}`,
        target: { type: 'schedule', scheduleId: schedule.id },
        scheduleId: schedule.id,
      };
      if (atMs > commentThreshold) {
        unread.push(item);
      } else {
        read.push(item);
      }
    }

    // 3. New comments on schedules where I have commented (excluding comments mentioning me)
    const myFirstIdx = comments.findIndex((c) => isMyId(c.memberId));
    if (myFirstIdx >= 0) {
      const followUpOthers = comments.slice(myFirstIdx + 1).filter((c) => {
        if (isMyId(c.memberId)) return false;
        if (mentionedCommentIds.has(c.id)) return false;
        const ms = parseServerTimeMs(c.receivedAt);
        return !Number.isNaN(ms) && ms >= minWindowMs;
      });

      if (followUpOthers.length > 0) {
        const unreadComments = followUpOthers.filter((c) => parseServerTimeMs(c.receivedAt) > commentThreshold);
        const isUnread = unreadComments.length > 0;
        const relevant = isUnread ? unreadComments : followUpOthers;
        let latestAt = -Infinity;
        for (const c of relevant) {
          const ms = parseServerTimeMs(c.receivedAt);
          if (ms > latestAt) latestAt = ms;
        }
        const dateLabel = formatScheduleDateLabel(schedule.date);
        const item: NewsItem = {
          key: `comment:${schedule.id}`,
          kind: 'comment',
          at: latestAt,
          title: `${schedule.title}(${dateLabel})에 새 댓글 ${relevant.length}개`,
          sub: `내가 댓글 단 일정 · ${formatRelativeKST(latestAt, nowMs)}`,
          target: { type: 'schedule', scheduleId: schedule.id },
          scheduleId: schedule.id,
        };
        if (isUnread) {
          unread.push(item);
        } else {
          read.push(item);
        }
      }
    }

    // 4. Unvoted required schedule (now >= start - 72h, before RSVP cutoff, no vote)
    const isRequired = isMemberRequiredForSchedule(
      currentMember,
      schedule.date,
      schedule,
      aliasIds,
      members
    );
    if (isRequired && isRsvpOpenForSchedule(schedule, nowDate)) {
      const myVote = findMyVote(
        rsvpVotes.filter((v) => v.scheduleId === schedule.id),
        aliasIds
      );
      if (!myVote) {
        const startDate = parseScheduleKST(schedule.date, schedule.startTime);
        if (startDate) {
          const startMs = startDate.getTime();
          const openAtMs = startMs - 72 * 3_600_000;
          const deadlineMs = startMs - RSVP_CUTOFF_BEFORE_MIN * 60_000;
          if (nowMs >= openAtMs && nowMs < deadlineMs) {
            const dateLabel = formatScheduleDateLabel(schedule.date);
            const item: NewsItem = {
              key: `unvoted:${schedule.id}`,
              kind: 'unvoted',
              at: openAtMs,
              title: `${schedule.title}(${dateLabel}) 투표를 아직 안 했어요`,
              sub: `투표 마감 ${formatDeadlineKST(deadlineMs)}`,
              target: { type: 'rsvp', scheduleId: schedule.id },
              scheduleId: schedule.id,
            };
            if (!seen.votes.has(schedule.id)) {
              unread.push(item);
            } else if (openAtMs >= minWindowMs) {
              read.push(item);
            }
          }
        }
      }
    }
  }

  // 5. Praise stickers
  for (const sticker of evaluatedStickers) {
    if (!sticker.earned) continue;
    const isUnread = !seen.stickers.has(sticker.id);
    const earnedMs = sticker.earnedOn
      ? Date.parse(`${sticker.earnedOn}T00:00:00+09:00`)
      : 0;
    const atMs = Number.isNaN(earnedMs) ? 0 : earnedMs;

    if (!isUnread && atMs < minWindowMs) continue;

    const item: NewsItem = {
      key: `sticker:${sticker.id}`,
      kind: 'sticker',
      at: atMs,
      title: `칭찬 스티커 ${withObjectParticle(sticker.name)} 받았어요`,
      sub: formatStickerDateLabel(sticker.earnedOn, nowMs),
      target: { type: 'sticker', stickerId: sticker.id },
      stickerId: sticker.id,
    };
    if (isUnread) {
      unread.push(item);
    } else {
      read.push(item);
    }
  }

  unread.sort((a, b) => b.at - a.at);
  read.sort((a, b) => b.at - a.at);

  return { unread, read };
}
