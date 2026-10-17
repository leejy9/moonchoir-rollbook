import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemberPortalModal } from './MemberPortalModal';
import type { BoundDeviceProfile } from '../types/rollbook';

describe('MemberPortalModal Component (2-Tab Streamlined Scorecard)', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'm_test_1',
    name: '김테스트',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-10-17T10:00:00Z',
  };

  it('renders 2-tab navigation and attendance table columns', () => {
    const html = renderToString(
      <MemberPortalModal
        profile={mockProfile}
        onClose={() => {}}
        onChangeBinding={() => {}}
      />
    );

    // Profile info
    expect(html).toContain('김테스트');
    expect(html).toContain('소프라노');

    // 2 Tabs
    expect(html).toContain('출결 기록 표');
    expect(html).toContain('개인 대시보드');

    // Tab 1 Attendance Table 4 Columns
    expect(html).toContain('연습명칭');
    expect(html).toContain('연습일');
    expect(html).toContain('투표 상태');
    expect(html).toContain('출결 시간');

    // Slim Attendance Summary
    expect(html).toContain('출석률');
  });
});
