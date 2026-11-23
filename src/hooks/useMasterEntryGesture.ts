import { useCallback, useEffect, useRef, useState } from 'react';

export interface MasterEntryGestureResult {
  showEasterEgg: boolean;
  setShowEasterEgg: (show: boolean) => void;
  easterEggRef: React.RefObject<HTMLDivElement | null>;
  logoHandlers: {
    onTouchStart: (e?: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
}

/**
 * 로고 제스처(PC 우클릭, 모바일 3연타/롱프레스)를 통해 마스터 관리자 진입 팝오버를 트리거하는 훅.
 * - 햅틱 피드백(navigator.vibrate 100ms) 유지
 * - 팝오버 외부 클릭 시 닫힘 처리
 * - 스크롤 중 롱프레스 오작동 방지 (10px 이상 터치 이동 시 타이머 취소)
 */
export function useMasterEntryGesture(): MasterEntryGestureResult {
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const easterEggRef = useRef<HTMLDivElement | null>(null);
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const cancelTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const triggerEasterEgg = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch {
        // ignore vibrate failures
      }
    }
    setShowEasterEgg(true);
  }, []);

  useEffect(() => {
    if (!showEasterEgg) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (easterEggRef.current && !easterEggRef.current.contains(e.target as Node)) {
        setShowEasterEgg(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [showEasterEgg]);

  const onTouchStart = (e?: React.TouchEvent) => {
    if (e?.touches?.[0]) {
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else {
      touchStartPosRef.current = null;
    }

    const now = Date.now();
    if (now - lastTapTimeRef.current < 450) {
      tapCountRef.current += 1;
      if (tapCountRef.current >= 3) {
        tapCountRef.current = 0;
        cancelTimer();
        triggerEasterEgg();
        return;
      }
    } else {
      tapCountRef.current = 1;
    }
    lastTapTimeRef.current = now;

    cancelTimer();
    longPressTimerRef.current = setTimeout(() => {
      triggerEasterEgg();
    }, 600);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !e.touches?.[0]) return;
    const dx = e.touches[0].clientX - touchStartPosRef.current.x;
    const dy = e.touches[0].clientY - touchStartPosRef.current.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 100) {
      // 10px 이상 이동 시 스크롤 제스처로 판단하여 타이머 취소
      cancelTimer();
      touchStartPosRef.current = null;
    }
  };

  const onTouchEnd = () => {
    cancelTimer();
    touchStartPosRef.current = null;
  };

  const onTouchCancel = () => {
    cancelTimer();
    touchStartPosRef.current = null;
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerEasterEgg();
  };

  return {
    showEasterEgg,
    setShowEasterEgg,
    easterEggRef,
    logoHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      onContextMenu,
    },
  };
}
