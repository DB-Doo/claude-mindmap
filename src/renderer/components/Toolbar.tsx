import { useCallback, useState, useRef, useEffect, type CSSProperties, type ChangeEvent } from 'react';
import { useSessionStore } from '../store/session-store';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

const toolbarStyle: CSSProperties = {
  height: 40,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  backgroundColor: '#12121a',
  borderBottom: '1px solid #2a2a3e',
  flexShrink: 0,
};

const btn: CSSProperties = {
  padding: '4px 10px',
  backgroundColor: 'transparent',
  color: '#888',
  border: '1px solid #2a2a3e',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  transition: 'all 0.15s',
};

const activeBtn: CSSProperties = {
  ...btn,
  color: '#e0e0e0',
  borderColor: '#a855f7',
  backgroundColor: 'rgba(168, 85, 247, 0.1)',
};

const groupStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 20,
  backgroundColor: '#2a2a3e',
};

const searchStyle: CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#0a0a0f',
  color: '#e0e0e0',
  border: '1px solid #2a2a3e',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'inherit',
  width: 160,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const statsStyle: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: '#888',
  fontSize: 10,
  whiteSpace: 'nowrap',
};

const costStyle: CSSProperties = {
  color: '#fbbf24',
  fontWeight: 600,
  fontSize: 11,
};

const recenterBtn: CSSProperties = {
  ...btn,
  color: '#34d399',
};

const recenterAlertBtn: CSSProperties = {
  ...btn,
  color: '#34d399',
  borderColor: '#34d399',
  backgroundColor: 'rgba(52, 211, 153, 0.1)',
};

export default function Toolbar() {
  const showThinking = useSessionStore(s => s.showThinking);
  const showText = useSessionStore(s => s.showText);
  const showSystem = useSessionStore(s => s.showSystem);
  const autoFollow = useSessionStore(s => s.autoFollow);
  const hasNewNodes = useSessionStore(s => s.hasNewNodesSinceManualPan);
  const toggleShowThinking = useSessionStore(s => s.toggleShowThinking);
  const toggleShowText = useSessionStore(s => s.toggleShowText);
  const toggleShowSystem = useSessionStore(s => s.toggleShowSystem);
  const toggleAutoFollow = useSessionStore(s => s.toggleAutoFollow);
  const requestCenter = useSessionStore(s => s.requestCenter);
  const nodeCount = useSessionStore(s => s.nodes.length);
  const searchQuery = useSessionStore(s => s.searchQuery);
  const setSearchQuery = useSessionStore(s => s.setSearchQuery);
  const tokenStats = useSessionStore(s => s.tokenStats);

  // Debounced search: local state updates instantly, store updates after 200ms
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalSearch(searchQuery); }, [searchQuery]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const onSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setSearchQuery(value), 200);
    },
    [setSearchQuery],
  );

  return (
    <div style={toolbarStyle}>
      <div style={groupStyle}>
        <button style={showThinking ? activeBtn : btn} onClick={toggleShowThinking}>
          Thinking
        </button>
        <button style={showText ? activeBtn : btn} onClick={toggleShowText}>
          Text
        </button>
        <button style={showSystem ? activeBtn : btn} onClick={toggleShowSystem}>
          System
        </button>
      </div>
      <div style={dividerStyle} />
      <button style={autoFollow ? activeBtn : btn} onClick={toggleAutoFollow}>
        Auto-follow
      </button>
      {nodeCount > 0 && (
        <button
          style={hasNewNodes ? recenterAlertBtn : recenterBtn}
          onClick={requestCenter}
        >
          Recenter{hasNewNodes ? ' *' : ''}
        </button>
      )}
      <div style={dividerStyle} />
      <input
        type="text"
        placeholder="Search nodes..."
        value={localSearch}
        onChange={onSearchChange}
        style={searchStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; }}
      />
      <div style={statsStyle}>
        <span>{nodeCount} nodes</span>
        {tokenStats.inputTokens > 0 && (
          <>
            <span>In: {formatTokens(tokenStats.inputTokens)}</span>
            <span>Out: {formatTokens(tokenStats.outputTokens)}</span>
            <span style={costStyle}>${tokenStats.estimatedCost.toFixed(2)}</span>
          </>
        )}
      </div>
    </div>
  );
}
