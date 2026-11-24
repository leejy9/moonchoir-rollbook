import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { sheetsService } from '../../services/sheets';
import type { Schedule } from '../../types/rollbook';
import type { TodayCtaState } from '../../utils/todayCta';
import { HomeActiveScheduleCard, type HomeCardComments } from './HomeActiveScheduleCard';

const schedule: Schedule = {
  id: 'A',
  title: '추가연습',
  category: '추가연습',
  date: '2026-11-24',
  startTime: '19:30',
  endTime: '21:40',
  locationName: '제1연습실',
};

const RSVP_NEW: TodayCtaState = { kind: 'RSVP_NEW', label: '참석 투표하기', isButton: true, disabled: false };
const RSVP_EDIT: TodayCtaState = { kind: 'RSVP_EDIT', status: 'ATTEND', label: '투표 수정 · 현재 참석', isButton: true, disabled: false };
const CHECKIN: TodayCtaState = { kind: 'CHECKIN_OPEN', isRequired: true, label: 'QR 찍기 / PIN 출석', isButton: true, disabled: false };

const noComments: HomeCardComments = { count: 0, hasNew: false };

function render(opts: {
  cta: TodayCtaState;
  isToday: boolean;
  dDay?: number;
  comments?: HomeCardComments;
}): string {
  return renderToString(
    <HomeActiveScheduleCard
      schedule={schedule}
      isToday={opts.isToday}
      dDay={opts.dDay}
      isRequired
      cta={opts.cta}
      comments={opts.comments ?? noComments}
      onOpenQRScanner={() => {}}
      onOpenRSVP={() => {}}
    />
  ).replace(/<!-- -->/g, '');
}

describe('HomeActiveScheduleCard (V3-22 R2·R4)', () => {
  beforeEach(() => {
    vi.spyOn(sheetsService, 'getLocationPresets').mockReturnValue([]);
  });

  it('오늘·투표 없음: 버튼 "참석 투표하기", 오른쪽 위 "투표 전"', () => {
    const html = render({ isToday: true, dDay: 0, cta: RSVP_NEW });
    expect(html).toContain('참석 투표하기');
    expect(html).toContain('home-card-corner is-warning">투표 전');
    expect(html.match(/<button/g)).toHaveLength(2); // CTA 1개 + 댓글 줄
  });

  it('오늘·출석 창 열림: QR 버튼, 오른쪽 위 없음', () => {
    const html = render({ isToday: true, dDay: 0, cta: CHECKIN });
    expect(html).toContain('QR 찍기 / PIN 출석');
    expect(html).not.toContain('home-card-corner');
  });

  it('오늘·출석 완료: 상태 글자, 오른쪽 위 없음', () => {
    const html = render({ isToday: true, dDay: 0, cta: { kind: 'ATTENDED', time: '13:58', label: '출석 완료 13:58', isButton: false } });
    expect(html).toContain('출석 완료 13:58');
    expect(html).not.toContain('home-card-corner');
  });

  it('미래 카드: "3일 뒤", 날짜 줄', () => {
    const html = render({ isToday: false, dDay: 3, cta: RSVP_EDIT });
    expect(html).toContain('투표 수정 · 현재 참석');
    expect(html).toContain('home-card-corner is-muted">3일 뒤');
    expect(html).toContain('11월 24일 화 · 19:30 ~ 21:40');
  });

  it('"상세 보기" 버튼과 ◀ ▶ 전환 줄이 없다', () => {
    const html = render({ isToday: false, dDay: 7, cta: RSVP_NEW });
    expect(html).not.toContain('상세 보기');
    expect(html).not.toContain('◀');
    expect(html).not.toContain('▶');
  });

  it('댓글 3개·새 댓글: 수, 점, 최근 댓글, aria-label', () => {
    const html = render({
      isToday: false,
      dDay: 3,
      cta: RSVP_NEW,
      comments: { count: 3, hasNew: true, last: { part: '알토', memberName: '민지', text: '저 30분 늦어요' } },
    });
    expect(html).toContain('home-card-comment-count">3<');
    expect(html).toContain('home-card-comment-dot');
    expect(html).toContain('home-card-comment-text">알토 민지 · 저 30분 늦어요<');
    expect(html).toContain('aria-label="댓글 3개, 새 댓글 있음. 일정 상세 열기"');
  });

  it('댓글 0개: "첫 댓글을 남겨 보세요", aria-label', () => {
    const html = render({ isToday: false, dDay: 3, cta: RSVP_NEW });
    expect(html).toContain('첫 댓글을 남겨 보세요');
    expect(html).toContain('aria-label="댓글 남기기. 일정 상세 열기"');
    expect(html).not.toContain('home-card-comment-dot');
  });
});
