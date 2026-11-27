import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AppHeader } from './AppHeader';

const render = (showAdminEntry: boolean) =>
  renderToString(<AppHeader onOpenAdmin={() => {}} onOpenSuperAdmin={() => {}} showAdminEntry={showAdminEntry} />);

describe('AppHeader (V3-22 R6)', () => {
  it('로고와 MOONCHOIR 한 줄, 기존 두 줄 이름은 없다', () => {
    const html = render(true);
    expect(html).toContain('MOONCHOIR');
    expect(html).not.toContain('문콰이어 출석부');
    expect(html).not.toContain('MOONCHOIR ATTENDANCE');
  });
  it('showAdminEntry가 참이면 설정 버튼이 있다', () => expect(render(true)).toContain('aria-label="관리자 모드"'));
  it('거짓이면 설정 버튼이 없다', () => expect(render(false)).not.toContain('관리자 모드'));
  it('로고 숨은 동작(우클릭 핸들러용 title)은 그대로다', () =>
    expect(render(false)).toContain('우클릭(PC) 또는 3연타(모바일) 시 최고 관리자 메뉴를 엽니다'));
});
