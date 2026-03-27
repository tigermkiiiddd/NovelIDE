import React, { useState, useEffect } from 'react';
import { useUiStore } from '../../stores/uiStore';

/**
 * Hook that manages panel resize logic (sidebar & agent).
 * Registers mouse/touch event listeners while actively resizing.
 */
export function usePanelResize() {
  const [isResizing, setIsResizing] = useState<'sidebar' | 'agent' | null>(null);
  const setSidebarWidth = useUiStore(state => state.setSidebarWidth);
  const setAgentWidth = useUiStore(state => state.setAgentWidth);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      if (isResizing === 'sidebar') {
        setSidebarWidth(Math.max(180, Math.min(e.clientX, 600)));
      } else {
        setAgentWidth(Math.max(250, Math.min(window.innerWidth - e.clientX, 800)));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const x = e.touches[0].clientX;
      if (isResizing === 'sidebar') {
        setSidebarWidth(Math.max(180, Math.min(x, 600)));
      } else {
        setAgentWidth(Math.max(250, Math.min(window.innerWidth - x, 800)));
      }
    };

    const stopResize = () => {
      setIsResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopResize);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopResize);
    };
  }, [isResizing, setSidebarWidth, setAgentWidth]);

  const startResize = (panel: 'sidebar' | 'agent') => setIsResizing(panel);

  return { isResizing, startResize };
}

interface ResizeHandleProps {
  panel: 'sidebar' | 'agent';
  onStart: (panel: 'sidebar' | 'agent') => void;
}

/** Thin vertical divider that initiates panel resize on drag. */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({ panel, onStart }) => (
  <div
    className="w-1 hover:w-1.5 h-full bg-gray-800 hover:bg-blue-500 cursor-col-resize transition-all z-40 shrink-0 touch-none"
    onMouseDown={() => onStart(panel)}
    onTouchStart={() => onStart(panel)}
  />
);
