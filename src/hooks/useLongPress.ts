import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  thresholdMs?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

export function useLongPress({
  thresholdMs = 3000,
  onLongPress,
  onClick,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(
    (_e: React.MouseEvent | React.TouchEvent) => {
      // Prevent context menu on long touch
      isLongPressRef.current = false;
      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(100);
          } catch {
            // Ignore vibrate errors on unsupported browsers
          }
        }
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs]
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isLongPressRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick?.();
    },
    [onClick]
  );

  return {
    onMouseDown: start,
    onMouseUp: handleMouseUp,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onClick: handleClick,
  };
}
