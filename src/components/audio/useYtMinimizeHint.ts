import { useState, useRef, useCallback, useEffect } from 'react';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../../services/sheetsStorage';

/**
 * Hook for YouTube minimize guidance toast (MEMBER_UX_V3_SPEC.md §3-3-5, §9, V25).
 * - "영상은 플레이어를 열어야 재생돼요"
 * - Appears for 3 seconds above MiniPlayer when full player is minimized with active video
 * - Shown at most twice per device (YT_MINIMIZE_HINT_COUNT < 2)
 * - Safe fallback: 2 (suppress toast on storage errors)
 */
export function useYtMinimizeHint() {
  const [showHint, setShowHint] = useState<boolean>(false);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHint = useCallback(() => {
    const hintCount = readPreference<number>(
      PREFERENCE_KEYS.YT_MINIMIZE_HINT_COUNT,
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0,
      2
    );
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
