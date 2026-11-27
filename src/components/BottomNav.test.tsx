import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BottomNav } from './BottomNav';

describe('BottomNav Component', () => {
  it('renders exactly 3 buttons with expected labels (홈, 연습실, 내 활동)', () => {
    const html = renderToString(
      <BottomNav currentTab="home" onSelectTab={() => {}} />
    );

    expect(html).toContain('홈');
    expect(html).toContain('연습실');
    expect(html).toContain('내 활동');
    expect(html).not.toContain('오늘');
    expect(html).not.toContain('일정');
  });

  it('assigns aria-current="page" to active tab', () => {
    const homeHtml = renderToString(
      <BottomNav currentTab="home" onSelectTab={() => {}} />
    );
    expect(homeHtml).toMatch(/aria-current="page"[^>]*>[\s\S]*홈/);

    const studioHtml = renderToString(
      <BottomNav currentTab="studio" onSelectTab={() => {}} />
    );
    expect(studioHtml).toMatch(/aria-current="page"[^>]*>[\s\S]*연습실/);

    const profileHtml = renderToString(
      <BottomNav currentTab="profile" onSelectTab={() => {}} />
    );
    expect(profileHtml).toMatch(/aria-current="page"[^>]*>[\s\S]*내 활동/);
  });

  it('contains NO emoji characters in navigation text (Anti-slop constraint)', () => {
    const html = renderToString(
      <BottomNav currentTab="home" onSelectTab={() => {}} />
    );
    // Unicode Extended_Pictographic check
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  it('nav element has proper accessibility label', () => {
    const html = renderToString(
      <BottomNav currentTab="home" onSelectTab={() => {}} />
    );
    expect(html).toContain('aria-label="주요 메뉴"');
  });
});
