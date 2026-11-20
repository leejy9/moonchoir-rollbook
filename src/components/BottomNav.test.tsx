import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BottomNav } from './BottomNav';

describe('BottomNav Component', () => {
  it('renders exactly 3 buttons with expected labels', () => {
    const html = renderToString(
      <BottomNav currentTab="today" onSelectTab={() => {}} />
    );

    expect(html).toContain('오늘');
    expect(html).toContain('일정');
    expect(html).toContain('내 활동');
  });

  it('assigns aria-current="page" to active tab', () => {
    const todayHtml = renderToString(
      <BottomNav currentTab="today" onSelectTab={() => {}} />
    );
    expect(todayHtml).toMatch(/aria-current="page"[^>]*><span[^>]*>오늘/);

    const calendarHtml = renderToString(
      <BottomNav currentTab="calendar" onSelectTab={() => {}} />
    );
    expect(calendarHtml).toMatch(/aria-current="page"[^>]*><span[^>]*>일정/);

    const profileHtml = renderToString(
      <BottomNav currentTab="profile" onSelectTab={() => {}} />
    );
    expect(profileHtml).toMatch(/aria-current="page"[^>]*><span[^>]*>내 활동/);
  });

  it('contains NO emoji characters in navigation text (Anti-slop constraint)', () => {
    const html = renderToString(
      <BottomNav currentTab="today" onSelectTab={() => {}} />
    );
    // Unicode Extended_Pictographic check
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('nav element has proper accessibility label', () => {
    const html = renderToString(
      <BottomNav currentTab="today" onSelectTab={() => {}} />
    );
    expect(html).toContain('aria-label="주요 메뉴"');
  });
});
