/**
 * Toast 通知组件
 * 顶部渐隐弹窗
 */

import React from 'react';
import { useToastStore, Toast as ToastType } from '../stores/toastStore';
import { X, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const ToastItem: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const removeToast = useToastStore((s) => s.removeToast);
  const [isExiting, setIsExiting] = React.useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => removeToast(toast.id), 200);
  };

  const icons = {
    error: <AlertCircle className="text-red-400 shrink-0" size={18} />,
    warning: <AlertTriangle className="text-yellow-400 shrink-0" size={18} />,
    success: <CheckCircle className="text-green-400 shrink-0" size={18} />,
    info: <Info className="text-blue-400 shrink-0" size={18} />,
  };

  const bgColors = {
    error: 'bg-red-950/90 border-red-800',
    warning: 'bg-yellow-950/90 border-yellow-800',
    success: 'bg-green-950/90 border-green-800',
    info: 'bg-blue-950/90 border-blue-800',
  };

  return (
    <div
      className={`
        flex items-start gap-2.5 p-2.5 rounded-lg border shadow-lg w-[min(360px,calc(100vw-24px))]
        transition-all duration-200
        pointer-events-auto
        ${bgColors[toast.type]}
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
        animate-slide-in-right
      `}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-gray-300 mt-1 break-words line-clamp-2">{toast.message}</div>
        )}
      </div>
      <button
        onClick={handleClose}
        className="text-gray-400 hover:text-white transition-colors shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};

export default ToastContainer;

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-in-right {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  .animate-slide-in-right {
    animation: slide-in-right 0.2s ease-out;
  }
`;
document.head.appendChild(style);
