/**
 * 문콰이어 출석부 — 날짜/시간 KST 표준화 및 매트릭스 헤더 포맷터
 */

const KOREAN_DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * ISO 문자열이나 일반 날짜 문자열을 한국 표준시(KST, UTC+9) Date 객체로 안전하게 파싱합니다.
 */
export function parseKSTDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // 1. 이미 YYYY-MM-DD 포맷인 경우 타임존 오프셋 왜곡 방지
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // 낮 12시로 고정하여 경계값 오류 방지
  }

  // 2. KST 표준 문자열 YYYY-MM-DD HH:mm:ss 형태 처리
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(dateStr)) {
    const [dPart, tPart] = dateStr.split(' ');
    const [y, m, d] = dPart.split('-').map(Number);
    const timeTokens = tPart.split(':').map(Number);
    const hh = timeTokens[0] || 0;
    const mm = timeTokens[1] || 0;
    const ss = timeTokens[2] || 0;
    return new Date(y, m - 1, d, hh, mm, ss);
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

/**
 * 한국 표준시(KST, Asia/Seoul) 기준 'YYYY-MM-DD HH:mm:ss' 표준 포맷 문자열을 반환합니다.
 * 구글 시트 저장 및 사람이 직접 열람할 때 UTC 오프셋 왜곡 없이 정확한 한국 시각을 제공합니다.
 */
export function getKSTTimestampString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  let y = '', m = '', d = '', hh = '', mm = '', ss = '';
  for (const p of parts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
    if (p.type === 'hour') hh = p.value;
    if (p.type === 'minute') mm = p.value;
    if (p.type === 'second') ss = p.value;
  }
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * 구글 시트 등에서 들어온 날짜를 'YYYY-MM-DD' 표준 형식으로 통일합니다.
 */
export function normalizeDateToYYYYMMDD(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const d = parseKSTDate(dateStr);
  // KST 기준 연-월-일 포맷팅
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 통합 출결 매트릭스 60px 헤더용 날짜/요일 포맷터
 * 예: '2026-10-07T15:00:00.000Z' (UTC 10/7 15시 -> KST 10/8 목) -> { dateLabel: '10/08', dayLabel: '(목)' }
 * 예: '2026-10-08' -> { dateLabel: '10/08', dayLabel: '(목)' }
 */
export function formatMatrixHeaderDate(rawDateStr: string): {
  dateLabel: string;
  dayLabel: string;
  fullDate: string;
} {
  if (!rawDateStr) {
    return { dateLabel: '--/--', dayLabel: '(-)', fullDate: '' };
  }

  // 1. 순수 YYYY-MM-DD 형태 처리
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
    const [y, m, d] = rawDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const day = KOREAN_DAY_NAMES[dateObj.getDay()] || '';
    return {
      dateLabel: `${mm}/${dd}`,
      dayLabel: `(${day})`,
      fullDate: rawDateStr,
    };
  }

  // 2. ISO 8601 문자열 (예: '2026-10-07T15:00:00.000Z')
  try {
    const dateObj = new Date(rawDateStr);
    if (isNaN(dateObj.getTime())) {
      return { dateLabel: rawDateStr.slice(0, 5), dayLabel: '', fullDate: rawDateStr };
    }

    // Intl을 이용해 한국 표준시(Asia/Seoul)로 월/일/요일 추출
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      year: 'numeric',
    });

    const parts = formatter.formatToParts(dateObj);
    let y = '';
    let m = '';
    let d = '';
    let weekday = '';

    for (const part of parts) {
      if (part.type === 'year') y = part.value;
      if (part.type === 'month') m = part.value;
      if (part.type === 'day') d = part.value;
      if (part.type === 'weekday') weekday = part.value;
    }

    return {
      dateLabel: `${m}/${d}`,
      dayLabel: weekday ? `(${weekday})` : '',
      fullDate: `${y}-${m}-${d}`,
    };
  } catch {
    return {
      dateLabel: rawDateStr.slice(5, 10) || rawDateStr,
      dayLabel: '',
      fullDate: rawDateStr,
    };
  }
}
