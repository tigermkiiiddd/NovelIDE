/**
 * useEditorLineHeights - 编辑器行高测量 Hook
 *
 * 测量每行在 wordWrap 模式下的实际高度
 */

import { useState, useCallback, useEffect } from 'react';

export const useEditorLineHeights = (
  content: string,
  wordWrap: boolean,
  textareaRef: React.RefObject<HTMLTextAreaElement>
): number[] => {
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  const measureLineHeights = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea || !wordWrap) {
      setLineHeights([]);
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const contentLines = content.split('\n');
    const newLineHeights: number[] = [];

    const textareaWidth = textarea.clientWidth;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const availableWidth = textareaWidth - paddingLeft - paddingRight;

    const measureDiv = document.createElement('div');
    measureDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      line-height: ${computedStyle.lineHeight};
      width: ${availableWidth}px;
    `;
    document.body.appendChild(measureDiv);

    contentLines.forEach((line) => {
      measureDiv.textContent = line || '\u200B';
      const height = measureDiv.offsetHeight;
      newLineHeights.push(height);
    });

    document.body.removeChild(measureDiv);
    setLineHeights(newLineHeights);
  }, [content, wordWrap, textareaRef]);

  useEffect(() => {
    measureLineHeights();
  }, [measureLineHeights]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(measureLineHeights, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureLineHeights]);

  return lineHeights;
};
