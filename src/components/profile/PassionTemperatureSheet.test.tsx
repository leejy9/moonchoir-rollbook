import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PassionTemperatureSheet } from './PassionTemperatureSheet';
import type { PassionTemperatureResult } from '../../utils/passionTemperature';

describe('PassionTemperatureSheet (V3-12)', () => {
  const mockResult: PassionTemperatureResult = {
    value: 38.2,
    weeklyDelta: 0.1,
    windowSize: 12,
    groups: [
      {
        key: 'attendance',
        title: '출석',
        totalDelta: 1.35,
        items: [
          {
            key: 'ontime',
            label: '정시 9회',
            count: 9,
            delta: 0.9,
            scheduleIds: ['s1', 's2'],
          },
          {
            key: 'late',
            label: '지각 0회',
            count: 0,
            delta: 0,
            scheduleIds: [],
          },
        ],
      },
      {
        key: 'promise',
        title: '약속',
        totalDelta: 0.15,
        items: [
          {
            key: 'early_vote',
            label: '24시간 전 투표 7회',
            count: 7,
            delta: 0.35,
            scheduleIds: ['s1'],
          },
        ],
      },
    ],
  };

  it('renders temperature, weekly delta, gauge bar, and groups with items', () => {
    const html = renderToString(
      <PassionTemperatureSheet
        result={mockResult}
        onClose={vi.fn()}
        onSelectScheduleFilter={vi.fn()}
      />
    );

    expect(html).toContain('38.2°C');
    expect(html).toContain('최근 12회');
    expect(html).toContain('▲ +0.1');
    expect(html).toContain('출석');
    expect(html).toContain('정시 9회');
    expect(html).toContain('지각 0회');
    expect(html).toContain('+1.35');
    expect(html).toContain('약속');
    expect(html).toContain('24시간 전 투표 7회');
  });

  it('renders empty state when windowSize is 0', () => {
    const emptyResult: PassionTemperatureResult = {
      value: 36.5,
      weeklyDelta: 0,
      windowSize: 0,
      groups: [
        {
          key: 'attendance',
          title: '출석',
          totalDelta: 0,
          items: [
            {
              key: 'late',
              label: '지각 0회',
              count: 0,
              delta: 0,
              scheduleIds: [],
            },
          ],
        },
      ],
    };

    const html = renderToString(
      <PassionTemperatureSheet
        result={emptyResult}
        onClose={vi.fn()}
        onSelectScheduleFilter={vi.fn()}
      />
    );

    expect(html).toContain('36.5°C');
    expect(html).toContain('아직 기록이 없어요');
  });
});
