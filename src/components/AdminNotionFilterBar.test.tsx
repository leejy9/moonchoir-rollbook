import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminNotionFilterBar, type AdminFilterState } from './AdminNotionFilterBar';

describe('AdminNotionFilterBar Component', () => {
  const defaultFilters: AdminFilterState = {
    dateStart: '',
    dateEnd: '',
    selectedParts: [],
    selectedStatuses: [],
    searchQuery: '',
  };

  it('renders dynamic member tally and schedule count without hardcoding', () => {
    const html = renderToString(
      <AdminNotionFilterBar
        filters={defaultFilters}
        onChangeFilters={() => {}}
        availableParts={['소프라노', '알토']}
        availableStatuses={['정단원', '준단원']}
        totalMembersCount={25}
        filteredMembersCount={18}
        totalSchedulesCount={7}
      />
    );

    // Verify dynamic schedule count
    expect(html).toContain('일정 7회차');
    expect(html).toContain('18명');
    expect(html).toContain('전체 25명');
    // Verify default date chip is "전체 일정" when date filters are unset
    expect(html).toContain('전체 일정');
  });

  it('renders custom date range and active chip when date bounds are specified', () => {
    const customFilters: AdminFilterState = {
      ...defaultFilters,
      dateStart: '2026-11-01',
      dateEnd: '2026-11-30',
    };

    const html = renderToString(
      <AdminNotionFilterBar
        filters={customFilters}
        onChangeFilters={() => {}}
        availableParts={['소프라노']}
        availableStatuses={['정단원']}
        totalMembersCount={10}
        filteredMembersCount={10}
        totalSchedulesCount={3}
      />
    );

    expect(html).toContain('2026-11-01 ~ 2026-11-30');
    expect(html).toContain('일정 3회차');
    expect(html).toContain('초기화');
  });
});
