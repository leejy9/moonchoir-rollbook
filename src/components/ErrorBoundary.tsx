import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught unhandled React error:', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetCache = (): void => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
        if ('caches' in window) {
          void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        }
      }
    } catch {
      // Ignore storage clear errors
    }
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
            backgroundColor: '#282C48',
            color: '#ffffff',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              marginBottom: '16px',
            }}
          >
            🌙
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0' }}>
            화면을 불러오는 중 문제가 발생했습니다
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.75)',
              margin: '0 0 24px 0',
              lineHeight: 1.5,
              maxWidth: '360px',
            }}
          >
            네트워크 상태 또는 로컬 캐시 문제일 수 있습니다. 아래 버튼으로 새로고침해 주세요.
          </p>
          {this.state.error && (
            <div
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#ffb4b4',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '20px',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ffffff',
                color: '#282C48',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              🔄 새로고침
            </button>
            <button
              type="button"
              onClick={this.handleResetCache}
              style={{
                padding: '12px 24px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              🧹 캐시 초기화 후 재시작
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
