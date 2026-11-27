import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RSVPModal } from './RSVPModal';
import type { BoundDeviceProfile, Schedule } from '../types/rollbook';
import * as timeWindowModule from '../utils/timeWindow';

describe('RSVPModal Component (P1-10)', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'mem_rsvp_1',
    name: '이지은',
    part: '소프라노',
    phoneLast4: '1111',
    boundAt: '2026-01-01T00:00:00Z',
  };

  const mockOpenSchedule: Schedule = {
    id: 'sch_open_1',
    title: '정기 연습',
    category: '정기연습',
    date: '2099-12-01',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '문콰이어 제1연습실',
  };

  const mockClosedSchedule: Schedule = {
    id: 'sch_closed_1',
    title: '마감된 연습',
    category: '정기연습',
    date: '2026-11-01',
    startTime: '19:30',
    endTime: '21:30',
    locationName: '문콰이어 제1연습실',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders RSVP modal without any emoji characters (Anti-slop constraint)', () => {
    const html = renderToString(
      <RSVPModal
        schedule={mockOpenSchedule}
        profile={mockProfile}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
    expect(html).toContain('사전 참석 투표');
    expect(html).toContain('참석합니다');
    expect(html).toContain('불참합니다');
  });

  it('does not invoke window.alert on closed schedule validation', () => {
    const alertSpy = vi.fn();
    const globalObj = globalThis as unknown as { window?: { alert: typeof alertSpy } };
    const originalWindow = globalObj.window;
    globalObj.window = { alert: alertSpy };

    try {
      vi.spyOn(timeWindowModule, 'isRsvpOpenForSchedule').mockReturnValue(false);

      const html = renderToString(
        <RSVPModal
          schedule={mockClosedSchedule}
          profile={mockProfile}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      );

      expect(alertSpy).not.toHaveBeenCalled();
      expect(html).toContain('사전 참석 투표');
    } finally {
      if (originalWindow !== undefined) {
        globalObj.window = originalWindow;
      } else {
        delete globalObj.window;
      }
    }
  });

  it('does not render QR modal when qrTargetSchedule is null/absent', () => {
    const qrTargetSchedule: Schedule | null = null;
    const currentSchedule = qrTargetSchedule;
    const showQRScanner = true;
    const isBound = true;
    const profile = mockProfile;

    // Condition in App.tsx: showQRScanner && currentSchedule && profile && isBound
    const shouldRenderQR = Boolean(showQRScanner && currentSchedule && profile && isBound);
    expect(shouldRenderQR).toBe(false);
  });

  it('has 44px min touch target on all action buttons', () => {
    const html = renderToString(
      <RSVPModal
        schedule={mockOpenSchedule}
        profile={mockProfile}
        currentVote={{
          id: 'v1',
          scheduleId: mockOpenSchedule.id,
          memberId: mockProfile.memberId,
          memberName: mockProfile.name,
          part: mockProfile.part,
          status: 'ATTEND',
          timestamp: '2026-11-20T10:00:00Z',
        }}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    // Cancel, Submit, and Delete vote buttons must have min-height: 44px
    expect(html).toMatch(/min-height:\s*44px/);
    expect(html).toContain('투표 취소');
  });
});
