/**
 * @file LoadingPage.tsx
 * @description 首次加载页面 — 处理 Transformers.js 模型下载和缓存检测
 *
 * 职责：
 * 1. 检测 embedding 模型是否已缓存到 IndexedDB
 * 2. 未缓存时显示下载进度条
 * 3. 已缓存时短暂显示品牌 Logo 后过渡到主界面
 * 4. 同时加载 IndexedDB 中的 store 数据
 */

import React, { useEffect, useState } from 'react';

interface LoadingPageProps {
  onReady: () => void;
}

interface LoadingState {
  phase: 'checking' | 'downloading' | 'ready';
  progress: number; // 0-100
  message: string;
}

export default function LoadingPage({ onReady }: LoadingPageProps) {
  const [state, setState] = useState<LoadingState>({
    phase: 'checking',
    progress: 0,
    message: '正在检查系统状态...',
  });

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        // Phase 3 will add actual model download logic here
        // For now, check if model is cached in IndexedDB

        // Simulate check — Phase 3 embeddingService will replace this
        setState({
          phase: 'checking',
          progress: 10,
          message: '正在加载知识系统...',
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        if (cancelled) return;

        setState({
          phase: 'ready',
          progress: 100,
          message: '准备就绪',
        });

        // Brief display of ready state before transitioning
        await new Promise(resolve => setTimeout(resolve, 200));

        if (!cancelled) {
          onReady();
        }
      } catch (error) {
        console.error('[LoadingPage] 初始化失败:', error);
        // Even on error, proceed to main UI
        onReady();
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Brand */}
      <div style={{
        fontSize: '2rem',
        fontWeight: 700,
        marginBottom: '2rem',
        letterSpacing: '0.05em',
      }}>
        NovelIDE
      </div>

      {/* Progress bar */}
      <div style={{
        width: '280px',
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        <div style={{
          width: `${state.progress}%`,
          height: '100%',
          background: state.phase === 'downloading'
            ? 'linear-gradient(90deg, #4a9eff, #7b5eff)'
            : '#4a9eff',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Status message */}
      <div style={{
        fontSize: '0.875rem',
        color: 'rgba(255,255,255,0.6)',
      }}>
        {state.message}
      </div>

      {/* Download progress percentage */}
      {state.phase === 'downloading' && (
        <div style={{
          fontSize: '0.75rem',
          color: 'rgba(255,255,255,0.4)',
          marginTop: '0.5rem',
        }}>
          {Math.round(state.progress)}%
        </div>
      )}
    </div>
  );
}
