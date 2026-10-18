import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemberProfileModal } from './MemberProfileModal';
import { sheetsService, resetStorage } from '../services/sheets';
import type { Member } from '../types/rollbook';
import { getKSTDateString } from '../utils/date';

describe('MemberProfileModal Component & Status History Invariant', () => {
  const todayStr = getKSTDateString();

  const mockMemberDefault: Member = {
    id: 'mem_test_1',
    name: '김테스트',
    part: '소프라노',
    phone: '010-1234-5678',
    phoneLast4: '5678',
    role: 'MEMBER',
    status: 'ACTIVE',
    memberStatus: '정단원',
    joinedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    note: '',
    statusHistory: [],
  };

  const defaultProps = {
    member: mockMemberDefault,
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    schedules: [],
    logs: [],
  };

  beforeEach(() => {
    resetStorage();
    vi.clearAllMocks();
  });

  it('renders compact modern period toggle switch row by default', () => {
    const html = renderToString(<MemberProfileModal {...defaultProps} />);

    // Toggle switch container and elements
    expect(html).toContain('period-setting-toggle-box');
    expect(html).toContain('modern-switch');
    expect(html).toContain('id="toggle-custom-period"');

    // Title text
    expect(html).toContain('특정 기간 한정 적용');
  });

  it('renders single-row iOS/Toss style segmented control bar for memberStatus', () => {
    const html = renderToString(<MemberProfileModal {...defaultProps} />);

    expect(html).toContain('status-segmented-control');
    expect(html).toContain('정단원');
    expect(html).toContain('준단원');
    expect(html).toContain('휴단');
    expect(html).toContain('퇴단');
    expect(html).toContain('선생님');
    expect(html).toContain('객원');
  });

  it('renders active toggle and summary card when member has an existing active custom period', () => {
    const memberWithActiveLeave: Member = {
      ...mockMemberDefault,
      memberStatus: '휴단원',
      statusHistory: [
        {
          id: 'hist_active_leave',
          memberId: 'mem_test_1',
          status: '휴단원',
          part: '소프라노',
          startDate: todayStr,
          endDate: '2026-12-31',
          reason: '개인 사정으로 휴단',
          createdAt: '2026-10-01 10:00:00',
        },
      ],
    };

    const html = renderToString(
      <MemberProfileModal {...defaultProps} member={memberWithActiveLeave} />
    );

    // Should render active period box & summary card
    expect(html).toContain('period-setting-toggle-box active');
    expect(html).toContain('period-summary-card');
    expect(html).toContain('기간 한정');
    expect(html).toContain('2026-12-31');
    expect(html).toContain('개인 사정으로 휴단');
    expect(html).toContain('수정');
  });

  it('ensures sheetsService.updateMember ALWAYS records and dispatches effectiveHistoryItem to DB on status change', async () => {
    sheetsService.updateConfig({ sheetsWebAppUrl: 'https://script.google.com/macros/s/test/exec' });
    const sendSpy = vi.spyOn(sheetsService as unknown as { sendToGoogleSheet: (...args: unknown[]) => Promise<unknown> }, 'sendToGoogleSheet')
      .mockResolvedValue({ success: true });

    // 1. Add sample member (sendSpy intercepts network)
    await sheetsService.addMember(mockMemberDefault);
    sendSpy.mockClear();

    // 2. Update member status from 정단원 to 휴단원 (without passing explicit historyItem)
    const updated = await sheetsService.updateMember(mockMemberDefault.id, {
      memberStatus: '휴단원',
    });

    // 3. Assert: Local member model should have statusHistory appended
    expect(updated.memberStatus).toBe('휴단원');
    expect(updated.statusHistory).toBeDefined();
    expect(updated.statusHistory!.length).toBe(1);
    expect(updated.statusHistory![0].status).toBe('휴단원');
    expect(updated.statusHistory![0].endDate).toBe('2999-12-31');

    // 4. Assert: Remote Google Sheet call MUST contain effectiveHistoryItem so '단원변경로그' tab receives it
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [action, payload] = sendSpy.mock.calls[0] as [string, { historyItem?: { status: string; endDate: string } }];
    expect(action).toBe('UPDATE_MEMBER');
    expect(payload.historyItem).toBeDefined();
    expect(payload.historyItem!.status).toBe('휴단원');
    expect(payload.historyItem!.endDate).toBe('2999-12-31');
  });
});
