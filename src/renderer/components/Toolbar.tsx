import { useCallback, useState, useRef, useEffect, type CSSProperties, type ChangeEvent } from 'react';
import { useSessionStore } from '../store/session-store';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import type { SessionInfo } from '../../shared/types';

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
  position: 'relative',
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

// ─── Date bucketing (reused from SessionPicker) ─────────────────────

type DateBucket = 'active' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

function getDateBucket(session: SessionInfo): DateBucket {
  if (session.endReason === 'active') return 'active';
  const d = new Date(session.timestamp);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  if (isThisWeek(d)) return 'thisWeek';
  if (isThisMonth(d)) return 'thisMonth';
  return 'older';
}

const BUCKET_LABELS: Record<DateBucket, string> = {
  active: 'Active',
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  older: 'Older',
};

const BUCKET_ORDER: DateBucket[] = ['active', 'today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];

// ─── Sessions Dropdown ──────────────────────────────────────────────

function SessionsDropdown({ onClose }: { onClose: () => void }) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close from the button click
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Group sessions by bucket
  const buckets = new Map<DateBucket, SessionInfo[]>();
  for (const s of sessions) {
    const bucket = getDateBucket(s);
    const list = buckets.get(bucket) || [];
    list.push(s);
    buckets.set(bucket, list);
  }
  // Sort within each bucket: newest first
  for (const list of buckets.values()) {
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: 40,
        left: 12,
        width: 340,
        maxHeight: 420,
        overflowY: 'auto',
        backgroundColor: '#12121a',
        border: '1px solid #2a2a3e',
        borderRadius: '0 0 8px 8px',
        zIndex: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      {BUCKET_ORDER.map((bucket) => {
        const items = buckets.get(bucket);
        if (!items || items.length === 0) return null;
        return (
          <div key={bucket}>
            <div style={{
              padding: '8px 12px 4px',
              fontSize: 9,
              fontWeight: 700,
              color: bucket === 'active' ? '#34d399' : '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {bucket === 'active' && (
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: '#34d399',
                  boxShadow: '0 0 4px #34d39980',
                }} />
              )}
              {BUCKET_LABELS[bucket]}
              <span style={{ fontSize: 9, color: '#475569', marginLeft: 'auto' }}>{items.length}</span>
            </div>
            {items.map((session) => {
              const isViewing = session.filePath === activeSessionPath;
              const lastPrompt = session.userPrompts?.length
                ? session.userPrompts[session.userPrompts.length - 1]
                : session.subtitle || session.displayText;
              return (
                <div
                  key={session.sessionId}
                  onClick={() => {
                    setActiveSession(session.filePath);
                    onClose();
                  }}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    borderLeft: isViewing ? '3px solid #a855f7' : '3px solid transparent',
                    background: isViewing ? '#1a1a2e' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!isViewing) e.currentTarget.style.background = '#161622'; }}
                  onMouseLeave={(e) => { if (!isViewing) e.currentTarget.style.background = isViewing ? '#1a1a2e' : 'transparent'; }}
                >
                  <div style={{
                    fontSize: 11,
                    color: isViewing ? '#e0e0e0' : '#94a3b8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {session.displayText}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 1,
                  }}>
                    {lastPrompt}
                  </div>
                  <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>
                    {format(new Date(session.timestamp), 'MMM d, HH:mm')}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {sessions.length === 0 && (
        <div style={{ padding: 16, fontSize: 11, color: '#475569', textAlign: 'center' }}>
          No sessions found
        </div>
      )}
    </div>
  );
}

// ─── Main Toolbar ───────────────────────────────────────────────────

export default function Toolbar() {
  const showThinking = useSessionStore(s => s.showThinking);
  const showText = useSessionStore(s => s.showText);
  const showSystem = useSessionStore(s => s.showSystem);
  const autoFollow = useSessionStore(s => s.autoFollow);
  const toggleShowThinking = useSessionStore(s => s.toggleShowThinking);
  const toggleShowText = useSessionStore(s => s.toggleShowText);
  const toggleShowSystem = useSessionStore(s => s.toggleShowSystem);
  const toggleAutoFollow = useSessionStore(s => s.toggleAutoFollow);
  const navigateToFirstUserMessage = useSessionStore(s => s.navigateToFirstUserMessage);
  const nodeCount = useSessionStore(s => s.nodes.length);
  const searchQuery = useSessionStore(s => s.searchQuery);
  const setSearchQuery = useSessionStore(s => s.setSearchQuery);
  const tokenStats = useSessionStore(s => s.tokenStats);
  const isWindowed = useSessionStore(s => s.isWindowed);
  const totalMessageCount = useSessionStore(s => s.totalMessageCount);
  const loadFullSession = useSessionStore(s => s.loadFullSession);
  const navigateUserMessage = useSessionStore(s => s.navigateUserMessage);
  const navigateToLastUserMessage = useSessionStore(s => s.navigateToLastUserMessage);
  const splitMode = useSessionStore(s => s.splitMode);
  const toggleSplitMode = useSessionStore(s => s.toggleSplitMode);

  const [sessionsOpen, setSessionsOpen] = useState(false);

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

  const toggleSessionsDropdown = useCallback(() => {
    setSessionsOpen((prev) => !prev);
  }, []);

  const closeSessionsDropdown = useCallback(() => {
    setSessionsOpen(false);
  }, []);

  return (
    <div style={toolbarStyle}>
      {/* Sessions dropdown */}
      <button
        style={sessionsOpen ? activeBtn : btn}
        onClick={toggleSessionsDropdown}
        title="Browse sessions"
      >
        Sessions {'\u25BE'}
      </button>
      {sessionsOpen && <SessionsDropdown onClose={closeSessionsDropdown} />}
      <div style={dividerStyle} />
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
        <>
          <button style={btn} onClick={navigateToFirstUserMessage} title="Jump to first user message">
            {'\u25C0\u25C0'}
          </button>
          <div style={dividerStyle} />
          <div style={groupStyle}>
            <button style={btn} onClick={() => navigateUserMessage('prev')} title="Previous user message">
              {'\u25C0'}
            </button>
            <button style={btn} onClick={() => navigateUserMessage('next')} title="Next user message">
              {'\u25B6'}
            </button>
            <button style={btn} onClick={navigateToLastUserMessage} title="Jump to last user message">
              {'\u25B6\u25B6'}
            </button>
          </div>
        </>
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
      <div style={dividerStyle} />
      {/* Split view toggle */}
      <button
        style={splitMode ? activeBtn : btn}
        onClick={toggleSplitMode}
        title={splitMode ? 'Close split view' : 'Open split view'}
      >
        {'\u29C9'} Split
      </button>
      <div style={statsStyle}>
        <span>{nodeCount} nodes</span>
        {isWindowed && (
          <button
            style={{
              ...btn,
              color: '#fbbf24',
              borderColor: '#fbbf24',
              fontSize: 10,
              padding: '2px 8px',
            }}
            onClick={loadFullSession}
            title={`Currently showing last 20 turns. Click to load all ${totalMessageCount} messages.`}
          >
            Load all ({totalMessageCount} msgs)
          </button>
        )}
        {(tokenStats.inputTokens > 0 || tokenStats.cacheRead > 0) && (
          <>
            <span>In: {formatTokens(tokenStats.inputTokens + tokenStats.cacheRead + tokenStats.cacheCreation)}</span>
            <span>Out: {formatTokens(tokenStats.outputTokens)}</span>
            <span style={costStyle}>${tokenStats.estimatedCost.toFixed(2)}</span>
            <span style={{ color: '#38bdf8' }}>
              {((tokenStats.inputTokens + tokenStats.cacheRead + tokenStats.cacheCreation + tokenStats.outputTokens) / 1_000_000 * 0.5).toFixed(1)}ml
            </span>
          </>
        )}
      </div>
    </div>
  );
}
