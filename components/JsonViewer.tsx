import React, { useMemo, useState } from 'react';

interface JsonViewerProps {
  content: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ content }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!parsedJson) {
    return (
      <div style={{ padding: '20px', color: '#f48771', backgroundColor: '#1e1e1e' }}>
        无效的 JSON 格式
      </div>
    );
  }

  const renderValue = (value: any, path: string, key?: string): React.ReactNode => {
    const isExpanded = expandedPaths.has(path);

    if (value === null) {
      return <span style={{ color: '#808080' }}>null</span>;
    }

    if (typeof value === 'boolean') {
      return <span style={{ color: '#569cd6' }}>{value.toString()}</span>;
    }

    if (typeof value === 'number') {
      return <span style={{ color: '#b5cea8' }}>{value}</span>;
    }

    if (typeof value === 'string') {
      return <span style={{ color: '#ce9178' }}>"{value}"</span>;
    }

    if (Array.isArray(value)) {
      return (
        <span>
          <span
            onClick={() => toggleExpand(path)}
            style={{ cursor: 'pointer', color: '#d4d4d4' }}
          >
            {isExpanded ? '▼' : '▶'} [{value.length}]
          </span>
          {isExpanded && (
            <span style={{ marginLeft: '20px' }}>
              {value.map((item, index) => (
                <div key={index}>
                  {renderValue(item, `${path}.${index}`, `[${index}]`)}
                </div>
              ))}
            </span>
          )}
        </span>
      );
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      return (
        <span>
          <span
            onClick={() => toggleExpand(path)}
            style={{ cursor: 'pointer', color: '#d4d4d4' }}
          >
            {isExpanded ? '▼' : '▶'} {'{'}...{'}'}
          </span>
          {isExpanded && (
            <span style={{ marginLeft: '20px' }}>
              {entries.map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: '#9cdcfe' }}>"{k}"</span>
                  <span style={{ color: '#d4d4d4' }}>: </span>
                  {renderValue(v, `${path}.${k}`)}
                </div>
              ))}
            </span>
          )}
        </span>
      );
    }

    return <span>{String(value)}</span>;
  };

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      padding: '16px',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      fontFamily: 'monospace',
      fontSize: '13px'
    }}>
      <pre style={{ margin: 0 }}>
        {renderValue(parsedJson, '')}
      </pre>
    </div>
  );
};
