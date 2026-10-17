import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemberPortalModal } from './MemberPortalModal';
import type { BoundDeviceProfile } from '../types/rollbook';

describe('MemberPortalModal Component', () => {
  const mockProfile: BoundDeviceProfile = {
    memberId: 'm_test_1',
    name: '김테스트',
    part: '소프라노',
    phoneLast4: '1234',
    boundAt: '2026-10-17T10:00:00Z',
  };

  it('renders member profile, part, and attendance scorecard', () => {
    const html = renderToString(
      <MemberPortalModal
        profile={mockProfile}
        onClose={() => {}}
        onChangeBinding={() => {}}
      />
    );

    expect(html).toContain('김테스트');
    expect(html).toContain('소프라노');
    expect(html).toContain('1234');
    expect(html).toContain('누적 출석률');
    expect(html).toContain('출석 원천 로그');
    expect(html).toContain('사전 투표');
  });
});
