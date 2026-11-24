import { describe, expect, it } from 'vitest';
import {
  cardCornerLabel,
  commentRowAriaLabel,
  formatCardDateLine,
  isCheckedInFinalStatus,
  lastCommentText,
} from './homeCardText';

describe('homeCardText (V3-22 R2·R4)', () => {
  it('날짜·시간 줄', () =>
    expect(formatCardDateLine({ date: '2026-11-24', startTime: '19:30', endTime: '21:40' })).toBe(
      '11월 24일 화 · 19:30 ~ 21:40'
    ));
  it('토요일 오늘 카드', () =>
    expect(formatCardDateLine({ date: '2026-11-21', startTime: '14:00', endTime: '17:00' })).toBe(
      '11월 21일 토 · 14:00 ~ 17:00'
    ));

  it('오늘 + 투표 전 → "투표 전"(경고)', () =>
    expect(cardCornerLabel(true, 0, 'RSVP_NEW')).toEqual({ text: '투표 전', tone: 'warning' }));
  it('오늘 + 출석 창 열림 → 없음', () => expect(cardCornerLabel(true, 0, 'CHECKIN_OPEN')).toBeUndefined());
  it('오늘 + 출석 완료 → 없음', () => expect(cardCornerLabel(true, 0, 'ATTENDED')).toBeUndefined());
  it('미래 3일 → "3일 뒤"', () =>
    expect(cardCornerLabel(false, 3, 'RSVP_EDIT')).toEqual({ text: '3일 뒤', tone: 'muted' }));
  it('미래 7일 → "7일 뒤"', () =>
    expect(cardCornerLabel(false, 7, 'RSVP_NEW')).toEqual({ text: '7일 뒤', tone: 'muted' }));

  it('최근 댓글 글자', () =>
    expect(lastCommentText({ part: '알토', memberName: '민지', text: '저 30분 늦어요' })).toBe(
      '알토 민지 · 저 30분 늦어요'
    ));
  it('aria-label: 새 댓글 있음', () =>
    expect(commentRowAriaLabel(3, true)).toBe('댓글 3개, 새 댓글 있음. 일정 상세 열기'));
  it('aria-label: 새 댓글 없음', () => expect(commentRowAriaLabel(2, false)).toBe('댓글 2개. 일정 상세 열기'));
  it('aria-label: 0개', () => expect(commentRowAriaLabel(0, false)).toBe('댓글 남기기. 일정 상세 열기'));

  it('달력 체크 대상: 출석·지각·수동인정만', () => {
    expect(isCheckedInFinalStatus('출석')).toBe(true);
    expect(isCheckedInFinalStatus('지각')).toBe(true);
    expect(isCheckedInFinalStatus('수동인정')).toBe(true);
    expect(isCheckedInFinalStatus('결석')).toBe(false);
    expect(isCheckedInFinalStatus('사유결석')).toBe(false);
    expect(isCheckedInFinalStatus('대기')).toBe(false);
    expect(isCheckedInFinalStatus(undefined)).toBe(false);
  });
});
