import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatRoute,
  navReducer,
  parseRoute,
  type NavAction,
  type Route,
} from '../utils/route';

export interface UseHashRouteResult {
  route: Route;
  navigate: (action: NavAction) => void;
}

/**
 * window.location.hash 기반 해시 라우팅 상태 및 네비게이션 관리 훅.
 * - popstate 및 hashchange 이벤트를 구독하여 브라우저 앞/뒤로 가기를 안전하게 반영합니다.
 * - navReducer의 결과(history: push | replace | none)에 따라 history API를 호출합니다.
 */
export function useHashRoute(): UseHashRouteResult {
  const [route, setRoute] = useState<Route>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    return parseRoute(hash);
  });

  const routeRef = useRef<Route>(route);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleHashChange = () => {
      const currentHash = window.location.hash;
      const next = parseRoute(currentHash);
      routeRef.current = next;
      setRoute(next);
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    // Initial check: if hash is empty or just '#/', normalize to #/today
    const current = window.location.hash.trim().replace(/^#\/?/, '');
    if (!current) {
      window.history.replaceState(null, '', '#/today');
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const navigate = useCallback((action: NavAction) => {
    if (action.type === 'CLOSE') {
      if (typeof window !== 'undefined' && window.history.state?.mcOverlay === true) {
        window.history.back();
        return;
      }
      const { route: next } = navReducer(routeRef.current, action);
      const nextHash = formatRoute(next);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', nextHash);
      }
      routeRef.current = next;
      setRoute(next);
      return;
    }

    const { route: next, history: historyAction } = navReducer(routeRef.current, action);
    if (historyAction === 'none') {
      return;
    }
    const nextHash = formatRoute(next);

    if (typeof window !== 'undefined') {
      if (action.type === 'OPEN' && historyAction === 'push') {
        window.history.pushState({ mcOverlay: true }, '', nextHash);
      } else if (historyAction === 'push') {
        window.history.pushState(null, '', nextHash);
      } else if (historyAction === 'replace') {
        window.history.replaceState(null, '', nextHash);
      }
    }

    routeRef.current = next;
    setRoute(next);
  }, []);

  return { route, navigate };
}
