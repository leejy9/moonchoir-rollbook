import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RoundTimePicker } from './RoundTimePicker';

describe('RoundTimePicker Component', () => {
  it('renders formatted 12-hour Korean time for afternoon/evening values', () => {
    const html = renderToString(
      <RoundTimePicker
        value="19:30"
        onChange={() => {}}
      />
    );

    // 19:30 should be displayed as 오후 07:30
    expect(html).toContain('오후 07:30');
    expect(html).toContain('⏰');
  });

  it('renders formatted 12-hour Korean time for morning values', () => {
    const html = renderToString(
      <RoundTimePicker
        value="09:15"
        onChange={() => {}}
      />
    );

    // 09:15 should be displayed as 오전 09:15
    expect(html).toContain('오전 09:15');
  });

  it('handles midnight (00:00) and noon (12:00) accurately', () => {
    const midnightHtml = renderToString(
      <RoundTimePicker
        value="00:00"
        onChange={() => {}}
      />
    );
    expect(midnightHtml).toContain('오전 12:00');

    const noonHtml = renderToString(
      <RoundTimePicker
        value="12:00"
        onChange={() => {}}
      />
    );
    expect(noonHtml).toContain('오후 12:00');
  });

  it('renders placeholder when value is empty', () => {
    const html = renderToString(
      <RoundTimePicker
        value=""
        onChange={() => {}}
        placeholder="시간을 선택하세요"
      />
    );
    expect(html).toContain('시간을 선택하세요');
  });
});
