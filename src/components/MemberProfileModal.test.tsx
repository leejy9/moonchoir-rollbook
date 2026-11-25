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

  it('uses the custom calendar picker for the join date', () => {
    const html = renderToString(<MemberProfileModal {...defaultProps} />);

    expect(html).toContain('2026. 01. 01.');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('type="date"');
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

  /**
   * 회귀: 과거 시트에서 넘어온 단원은 전체 번호(phone) 없이 뒷자리 4자리만 있다.
   * 관리자가 전화번호를 건드리지 않고 파트/상태만 바꿔도 digits.length === 4 라서
   * 기존 검증(digits.length < 10)에 걸려 폼 제출 자체가 막혔다.
   *
   * 제출 유효성은 resolvePhoneForSubmit(src/utils/memberPhone.ts)이 결정하며,
   * 그 함수의 실제 동작은 src/utils/memberPhone.test.ts가 값 수준으로 검사한다.
   * 여기서는 모달이 그 규칙에 맞는 화면을 그리는지 본다.
   */
  describe('레거시 단원(전화번호 뒷자리만 보유) 안내', () => {
    const legacyMember: Member = {
      id: 'mem_legacy_1',
      name: '레거시단원',
      part: '소프라노',
      phone: '',
      phoneLast4: '1234',
      role: 'MEMBER',
      status: 'ACTIVE',
      memberStatus: '정단원',
      joinedAt: '2024-03-01',
      createdAt: '2024-03-01T00:00:00Z',
      note: '',
    };

    it('기존 뒷자리 보존을 안내하고 전화번호 입력을 필수로 만들지 않는다', () => {
      const html = renderToString(
        <MemberProfileModal
          {...defaultProps}
          member={legacyMember}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />
      );

      // SSR은 텍스트 노드 사이에 <!-- --> 마커를 넣으므로 태그를 지우고 비교한다.
      const text = html.replace(/<!--.*?-->/g, '');

      expect(text).toContain('기존 번호(뒷자리: ****-1234)가 보존됩니다');
      expect(text).toContain('변경하려면 전체 11자리를 입력하세요');
      // 번호가 비어 있는데 required가 걸려 있으면 브라우저가 제출을 막는다.
      expect(html).toMatch(/<input type="tel"[^>]*\/>/);
      expect(html).not.toMatch(/<input type="tel"[^>]*required/);
    });

    it('전체 번호가 있는 일반 단원에게는 기존 안내 문구를 그대로 보여준다', () => {
      const html = renderToString(<MemberProfileModal {...defaultProps} />);

      expect(html).toContain('전체 휴대폰 번호를 저장합니다');
      expect(html).not.toContain('가 보존됩니다');
    });
  });
});
