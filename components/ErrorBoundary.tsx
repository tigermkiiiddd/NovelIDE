import React from 'react';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div style={{
      padding: '24px',
      margin: '16px',
      border: '1px solid #ff4d4f',
      borderRadius: '8px',
      backgroundColor: '#fff2f0',
      color: '#333',
      fontFamily: 'sans-serif',
    }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#ff4d4f' }}>
        页面出现错误
      </h3>
      <details style={{ marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
        <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
          错误详情
        </summary>
        <code style={{ fontSize: '12px' }}>{error.message}</code>
        {error.stack && (
          <pre style={{
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '200px',
            background: '#f5f5f5',
            padding: '8px',
            borderRadius: '4px',
          }}>
            {error.stack}
          </pre>
        )}
      </details>
      <button
        onClick={resetErrorBoundary}
        style={{
          padding: '8px 16px',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          cursor: 'pointer',
          backgroundColor: '#fff',
        }}
      >
        重试
      </button>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.resetErrorBoundary}
        />
      );
    }
    return this.props.children;
  }
}
