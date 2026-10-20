import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminProgramCardForm } from './AdminProgramCardForm';
import type { ProgramCard, LocationPreset, Member } from '../../types/rollbook';

describe('AdminProgramCardForm Component', () => {
  const dummyLocations: LocationPreset[] = [
    { id: 'loc_1', name: '문콰이어 연습실', latitude: 37.5, longitude: 127.0, radiusMeters: 100 },
  ];
  const dummyMembers: Member[] = [
    {
      id: 'mem_1',
      name: '김합창',
      part: 'Soprano',
      phoneLast4: '1234',
      status: 'ACTIVE',
      role: 'MEMBER',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  it('renders creation form when initialCard is null', () => {
    const html = renderToString(
      <AdminProgramCardForm
        initialCard={null}
        dynamicCategories={['정기연습', '추가연습', '연주']}
        dynamicParts={['Soprano', 'Alto', 'Tenor', 'Bass']}
        locationPresets={dummyLocations}
        members={dummyMembers}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toContain('카드 등록');
    expect(html).toContain('저장');
    expect(html).toContain('← 뒤로');
    expect(html).toContain('구분');
    expect(html).toContain('Soprano, Alto, Tenor, Bass');
  });

  it('renders edit form with initialCard values', () => {
    const sampleCard: ProgramCard = {
      id: 'card_123',
      title: '2026 가을 정기연주회',
      category: '연주',
      description: '연주회 프로젝트 묶음',
      defaultStartTime: '18:00',
      defaultEndTime: '21:00',
      targetAudienceType: 'ALL',
      isArchived: false,
      createdAt: '2026-10-18T10:00:00Z',
    };

    const html = renderToString(
      <AdminProgramCardForm
        initialCard={sampleCard}
        dynamicCategories={['정기연습', '추가연습', '연주']}
        dynamicParts={['Soprano', 'Alto', 'Tenor', 'Bass']}
        locationPresets={dummyLocations}
        members={dummyMembers}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toContain('카드 수정');
    expect(html).toContain('2026 가을 정기연주회');
    expect(html).toContain('연주회 프로젝트 묶음');
  });

  it('displays success banner if successMessage is provided', () => {
    const html = renderToString(
      <AdminProgramCardForm
        initialCard={null}
        dynamicCategories={['정기연습']}
        dynamicParts={['Soprano']}
        locationPresets={dummyLocations}
        members={dummyMembers}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        successMessage="카드 저장이 완료되었습니다!"
      />
    );

    expect(html).toContain('카드 저장이 완료되었습니다!');
  });
});
