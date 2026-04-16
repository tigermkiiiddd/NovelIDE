/**
 * @file LoadingPage.tsx
 * @description 首次加载页面 — embedding 模型下载
 */

import React, { useEffect, useState, useRef } from 'react';
import { initEmbeddingModel, setEmbeddingProgressCallback, EmbeddingProgress } from '../domains/memory/embeddingService';

interface LoadingPageProps {
  onReady: () => void;
}

const fileItemStyle: React.CSSProperties = {
  fontSize: '0.75rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.5)',
};

export default function LoadingPage({ onReady }: LoadingPageProps) {
  const [progress, setProgress] = useState<EmbeddingProgress>({
    progress: 0, status: 'idle', message: '正在初始化...',
    completedFiles: [], currentFile: '',
  });
  const [phase, setPhase] = useState<'loading' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    function doLoad() {
      if (cancelled) return;
      setPhase('loading');
      setErrorMsg('');
      setProgress({ progress: 0, status: 'loading', message: '正在准备...', completedFiles: [], currentFile: '' });

      const useMirror = (() => {
        try { return localStorage.getItem('EMBEDDING_USE_MIRROR') === 'true'; } catch { return false; }
      })();
      const host = useMirror ? 'hf-mirror.com' : 'huggingface.co';
      setDownloadUrl(`https://${host}/Xenova/bge-small-zh-v1.5`);

      setEmbeddingProgressCallback((p) => {
        if (!cancelled) setProgress(p);
      });

      initEmbeddingModel()
        .then(() => {
          if (!cancelled) setPhase('done');
        })
        .catch((error: any) => {
          const msg = error?.message || error?.toString?.() || '未知错误';
          if (!cancelled) {
            setErrorMsg(msg);
            setPhase('error');
            setProgress(p => ({ ...p, status: 'error' }));
          }
        });
    }

    retryRef.current = doLoad;
    doLoad();

    return () => { cancelled = true; setEmbeddingProgressCallback(null); };
  }, []);

  const completedFiles = progress.completedFiles || [];
  const currentFile = progress.currentFile || '';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.05em' }}>
        NovelIDE
      </div>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', marginBottom: '2rem' }}>
        AI 驱动的小说创作 IDE
      </div>

      {/* Progress bar */}
      <div style={{
        width: '320px', height: '6px',
        background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden',
        marginBottom: '0.8rem',
      }}>
        <div style={{
          width: `${progress.progress}%`, height: '100%',
          background: phase === 'error' ? '#ff6b6b' : 'linear-gradient(90deg, #4a9eff, #7b5eff)',
          borderRadius: '3px', transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Current status */}
      <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        {phase === 'done' ? '全部下载完成' : progress.message}
      </div>

      {/* Percentage */}
      {phase === 'loading' && progress.progress > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.4rem' }}>
          {Math.round(progress.progress)}%
        </div>
      )}

      {/* File list */}
      {(completedFiles.length > 0 || currentFile) && (
        <div style={{
          marginTop: '1rem', width: '340px',
          background: 'rgba(255,255,255,0.04)', borderRadius: '6px',
          padding: '10px 14px',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {completedFiles.map(f => (
            <div key={f} style={fileItemStyle}>
              ✓ {f}
            </div>
          ))}
          {currentFile && phase === 'loading' && (
            <div style={{ ...fileItemStyle, color: '#7b5eff' }}>
              ↓ {currentFile} {progress.progress > 0 ? `${Math.round(progress.progress)}%` : ''}
            </div>
          )}
        </div>
      )}

      {/* Download URL */}
      {phase === 'loading' && downloadUrl && (
        <div style={{
          fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.8rem',
          maxWidth: '320px', wordBreak: 'break-all', textAlign: 'center',
        }}>
          下载源: {downloadUrl}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <button onClick={onReady} style={{
          marginTop: '1.5rem', padding: '8px 32px',
          border: 'none', borderRadius: '4px',
          background: 'linear-gradient(90deg, #4a9eff, #7b5eff)',
          color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500,
        }}>
          进入 NovelIDE
        </button>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            fontSize: '0.75rem', color: '#ff6b6b',
            maxWidth: '350px', textAlign: 'center', lineHeight: 1.5,
          }}>
            {errorMsg}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button onClick={() => retryRef.current()} style={{
              padding: '6px 20px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px',
              background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem',
            }}>
              重试
            </button>
            <button onClick={onReady} style={{
              padding: '6px 20px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px',
              background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem',
            }}>
              跳过（降级运行）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
