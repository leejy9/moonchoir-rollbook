import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('정상적인 자식 컴포넌트를 그대로 렌더링한다', () => {
    const html = renderToString(
      <ErrorBoundary>
        <div>정상 컴포넌트</div>
      </ErrorBoundary>
    );
    expect(html).toContain('정상 컴포넌트');
  });

  it('에러 상태일 때 복구 화면 HTML을 생성한다', () => {
    const boundary = new ErrorBoundary({ children: <div>자식</div> });
    const errorState = ErrorBoundary.getDerivedStateFromError(new Error('테스트 에러 메시지'));
    boundary.state = errorState;

    const rendered = boundary.render();
    const html = renderToString(rendered as React.ReactElement);

    expect(html).toContain('화면을 불러오는 중 문제가 발생했습니다');
    expect(html).toContain('테스트 에러 메시지');
    expect(html).toContain('새로고침');
    expect(html).toContain('캐시 초기화 후 재시작');
  });
});
