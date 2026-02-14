/**
 * EditorGutter - 编辑器行号显示组件
 *
 * 从 Editor.tsx 提取，负责显示代码行号
 */

import React from 'react';

export interface EditorGutterProps {
  lines: number[];
  showLineNumbers: boolean;
  className?: string;
}

export const EditorGutter: React.FC<EditorGutterProps> = ({
  lines,
  showLineNumbers,
  className = ''
}) => {
  if (!showLineNumbers) return null;

  return (
    <div
      ref={undefined}
      className={`${className} shrink-0 w-10 sm:w-12 bg-[#0d1117] border-r border-gray-800 text-right pr-2 pt-4 sm:pt-6 text-gray-600 select-none overflow-hidden font-mono text-sm sm:text-base leading-relaxed`}
      aria-hidden="true"
    >
      {lines.map((ln) => (
        <div key={ln}>{ln}</div>
      ))}
      {/* Extra padding at bottom to match textarea scrolling */}
      <div className="h-20" />
    </div>
  );
};
