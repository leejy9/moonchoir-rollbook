export type MemberTab = 'home' | 'studio' | 'profile';

export type Overlay =
  | { kind: 'scheduleSheet'; date: string; scheduleId?: string }
  | { kind: 'qr'; scheduleId: string }
  | { kind: 'rsvp'; scheduleId: string }
  | { kind: 'player' }
  | { kind: 'score'; pieceId: string };

export type Route =
  | { area: 'member'; tab: MemberTab; month?: string; overlay?: Overlay }
  | { area: 'admin' }
  | { area: 'superAdmin' };

export type NavAction =
  | { type: 'TAB'; tab: MemberTab; month?: string }
  | { type: 'OPEN'; overlay: Overlay }
  | { type: 'CLOSE' }
  | { type: 'ADMIN' }
  | { type: 'SUPER' }
  | { type: 'RESET' };

export interface NavResult {
  route: Route;
  history: 'push' | 'replace' | 'none';
}

function isValidMonth(m: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return false;
  return true;
}

function isValidDate(d: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === day;
}

/**
 * 해시 문자열을 파싱하여 Route 객체로 변환합니다.
 * 모르는 형식, 빈 문자열은 '#/home'으로 안전 폴백합니다.
 * v2 옛 주소(#/today, #/calendar)는 #/home으로 호환 해석합니다.
 */
export function parseRoute(hash: string): Route {
  const fallback: Route = { area: 'member', tab: 'home' };
  const raw = (hash || '').trim().replace(/^#\/?/, '');
  if (!raw) return fallback;

  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.toLowerCase();

  if (path === 'admin') return { area: 'admin' };
  if (path === 'super' || path === 'superadmin') return { area: 'superAdmin' };

  const params = new URLSearchParams(queryPart || '');

  if (path === 'profile') {
    const isScore = params.get('score') === '1' && !!params.get('pieceId');
    const isPlayer = params.get('player') === '1';
    const overlay: Overlay | undefined = isScore
      ? { kind: 'score', pieceId: params.get('pieceId')! }
      : isPlayer
      ? { kind: 'player' }
      : undefined;
    return {
      area: 'member',
      tab: 'profile',
      overlay,
    };
  }

  if (path === 'studio') {
    const isScore = params.get('score') === '1' && !!params.get('pieceId');
    const isPlayer = params.get('player') === '1';
    const overlay: Overlay | undefined = isScore
      ? { kind: 'score', pieceId: params.get('pieceId')! }
      : isPlayer
      ? { kind: 'player' }
      : undefined;
    return {
      area: 'member',
      tab: 'studio',
      overlay,
    };
  }

  if (path === 'home' || path === 'calendar' || path === 'today') {
    const rawM = params.get('m');
    const month = rawM && isValidMonth(rawM) ? rawM : undefined;
    const rawD = params.get('d');
    const d = rawD && isValidDate(rawD) ? rawD : undefined;
    const isSheet = params.get('sheet') === '1';
    const sid = params.get('sid') || undefined;

    let overlay: Overlay | undefined;
    if (isSheet && d) {
      overlay = { kind: 'scheduleSheet', date: d, scheduleId: sid };
    } else if (params.get('qr') === '1' && sid) {
      overlay = { kind: 'qr', scheduleId: sid };
    } else if (params.get('rsvp') === '1' && sid) {
      overlay = { kind: 'rsvp', scheduleId: sid };
    } else if (params.get('score') === '1' && params.get('pieceId')) {
      overlay = { kind: 'score', pieceId: params.get('pieceId')! };
    } else if (params.get('player') === '1') {
      overlay = { kind: 'player' };
    }

    return { area: 'member', tab: 'home', month, overlay };
  }

  return fallback;
}

/**
 * Route 객체를 표준 해시 문자열로 직렬화합니다.
 * parseRoute(formatRoute(r))와 r은 완전히 일치해야 합니다.
 */
export function formatRoute(route: Route): string {
  if (route.area === 'admin') return '#/admin';
  if (route.area === 'superAdmin') return '#/super';

  const tab = route.tab;

  if (route.overlay) {
    if (route.overlay.kind === 'scheduleSheet') {
      const q = new URLSearchParams();
      q.set('d', route.overlay.date);
      q.set('sheet', '1');
      if (route.overlay.scheduleId) q.set('sid', route.overlay.scheduleId);
      if (route.month) q.set('m', route.month);
      return `#/home?${q.toString()}`;
    }
    if (route.overlay.kind === 'qr') {
      const q = new URLSearchParams();
      q.set('qr', '1');
      q.set('sid', route.overlay.scheduleId);
      return `#/${tab}?${q.toString()}`;
    }
    if (route.overlay.kind === 'rsvp') {
      const q = new URLSearchParams();
      q.set('rsvp', '1');
      q.set('sid', route.overlay.scheduleId);
      return `#/${tab}?${q.toString()}`;
    }
    if (route.overlay.kind === 'score') {
      const q = new URLSearchParams();
      q.set('score', '1');
      q.set('pieceId', route.overlay.pieceId);
      if (tab === 'home' && route.month) q.set('m', route.month);
      return `#/${tab}?${q.toString()}`;
    }
    if (route.overlay.kind === 'player') {
      const q = new URLSearchParams();
      q.set('player', '1');
      if (route.month) q.set('m', route.month);
      return `#/${tab}?${q.toString()}`;
    }
  }

  if (tab === 'home') {
    if (route.month) {
      return `#/home?m=${encodeURIComponent(route.month)}`;
    }
    return '#/home';
  }

  if (tab === 'profile') {
    return '#/profile';
  }

  if (tab === 'studio') {
    return '#/studio';
  }

  return '#/home';
}

/**
 * 사용자 내비게이션 액션에 따라 새 Route와 브라우저 히스토리 정책(push/replace/none)을 결정하는 순수 리듀서.
 */
export function navReducer(currentRoute: Route, action: NavAction): NavResult {
  switch (action.type) {
    case 'TAB': {
      const requestedMonth =
        action.month !== undefined
          ? action.month
          : currentRoute.area === 'member'
          ? currentRoute.month
          : undefined;

      if (
        currentRoute.area === 'member' &&
        currentRoute.tab === action.tab &&
        !currentRoute.overlay &&
        (action.month === undefined || action.month === currentRoute.month)
      ) {
        return { route: currentRoute, history: 'none' };
      }
      const isFromHome = currentRoute.area === 'member' && currentRoute.tab === 'home';
      const isInitialPush = isFromHome && action.tab !== 'home';

      const nextRoute: Route = {
        area: 'member',
        tab: action.tab,
        month: requestedMonth,
      };

      return {
        route: nextRoute,
        history: isInitialPush ? 'push' : 'replace',
      };
    }

    case 'OPEN': {
      if (currentRoute.area !== 'member') {
        return { route: currentRoute, history: 'none' };
      }
      const nextRoute: Route = {
        ...currentRoute,
        overlay: action.overlay,
      };
      return {
        route: nextRoute,
        history: 'push',
      };
    }

    case 'CLOSE': {
      if (currentRoute.area !== 'member' || !currentRoute.overlay) {
        return { route: currentRoute, history: 'none' };
      }
      const { overlay: _omitted, ...rest } = currentRoute;
      return {
        route: rest,
        history: 'replace',
      };
    }

    case 'ADMIN': {
      return {
        route: { area: 'admin' },
        history: 'push',
      };
    }

    case 'SUPER': {
      return {
        route: { area: 'superAdmin' },
        history: 'push',
      };
    }

    case 'RESET': {
      return {
        route: { area: 'member', tab: 'home' },
        history: 'replace',
      };
    }
  }
}
