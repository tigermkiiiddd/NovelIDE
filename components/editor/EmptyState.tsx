/**
 * EmptyState - 空状态提示组件
 *
 * 从 Editor.tsx 提取，当没有选择文件时显示提示信息
 */

import React from 'react';
import { FileText } from 'lucide-react';

export interface EmptyStateProps {
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ className = '' }) => {
  return (
    <div className={`flex flex-col items-center justify-center h-full text-gray-500 bg-[#0d1117] ${className}`}>
      <FileText size={48} className="mb-4 opacity-20" />
      <p className="text-sm">选择一个文件开始写作</p>
    </div>
  );
};
