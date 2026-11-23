import { useState, useRef, useCallback, useEffect } from 'react';
import { PREFERENCE_KEYS, writePreference } from '../../services/sheetsStorage';

/**
 * Hook for YouTube minimize guidance toast (MEMBER_UX_V3_SPEC.md §3-3-5, §9, V25, V3-20 R7).
 * - "영상은 플레이어를 열어야 재생돼요"
 * - Appears for 3 seconds above MiniPlayer when full player is minimized with active video
 * - Shown at most twice per device (YT_MINIMIZE_HINT_COUNT < 2)
 * - 없음 = 0 (신규 기기는 토스트 표시)
 * - 읽기 오류 / 형식 오류 = 2 (에러 시 안전하게 억제)
 */
function getStoredHintCount(): number {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) return 2;
    const raw = storage.getItem(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT);
    if (raw === null || raw === undefined) {
      return 0; // 없음 = 0
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
    return 2; // 형식 오류 = 2
  } catch {
    return 2; // 읽기 오류 = 2
  }
}

export function useYtMinimizeHint() {
  const [showHint, setShowHint] = useState<boolean>(false);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHint = useCallback(() => {
    const hintCount = getStoredHintCount();
    if (hintCount < 2) {
      writePreference(PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT, hintCount + 1);
      setShowHint(true);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        setShowHint(false);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  return { showHint, triggerHint };
}
