import { useEffect, useRef, useCallback } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Minimum distance for swipe (default: 50px)
  edgeThreshold?: number; // Maximum distance from edge to start swipe (default: 30px)
  enabled?: boolean;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * Hook for detecting edge swipe gestures on mobile devices.
 * - Swipe from left edge to right: triggers onSwipeRight (typically open sidebar)
 * - Swipe from right edge to left: triggers onSwipeLeft (typically open chat panel)
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  edgeThreshold = 30,
  enabled = true
}: SwipeGestureOptions) {
  const touchStateRef = useRef<TouchState | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now()
    };
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStateRef.current) return;

    const touch = e.changedTouches[0];
    const { startX, startY, startTime } = touchStateRef.current;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const deltaTime = Date.now() - startTime;

    // Reset touch state
    touchStateRef.current = null;

    // Check if swipe is horizontal (not vertical scroll)
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    // Check if swipe is fast enough (under 300ms)
    if (deltaTime > 300) return;

    // Check minimum distance
    if (Math.abs(deltaX) < threshold) return;

    // Swipe right from left edge -> open sidebar
    if (deltaX > 0 && startX < edgeThreshold) {
      onSwipeRight?.();
      return;
    }

    // Swipe left from right edge -> open chat
    if (deltaX < 0 && startX > window.innerWidth - edgeThreshold) {
      onSwipeLeft?.();
      return;
    }
  }, [enabled, threshold, edgeThreshold, onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);
}

export default useSwipeGesture;
