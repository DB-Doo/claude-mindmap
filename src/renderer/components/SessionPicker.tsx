import { useMemo, useState, useCallback } from 'react';
import { useSessionStore } from '../store/session-store';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import type { CSSProperties } from 'react';
import type { SessionInfo } from '../../shared/types';

const PROMPTS_PER_PAGE = 10;

type DateBucket = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

function getDateBucket(timestamp: string): DateBucket {
  const d = new Date(timestamp);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  if (isThisWeek(d)) return 'thisWeek';
  if (isThisMonth(d)) return 'thisMonth';
  return 'older';
}

const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  older: 'Older',
};

const BUCKET_ORDER: DateBucket[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];

// ─── Active Session Card ────────────────────────────────────────────────

function ActiveSessionCard({
  session,
  isViewing,
  onClick,
  onSplitClick,
  isInSplit,
}: {
  session: SessionInfo;
  isViewing: boolean;
  onClick: () => void;
  onSplitClick?: () => void;
  isInSplit?: boolean;
}) {
  const lastPrompt = session.userPrompts?.length
    ? session.userPrompts[session.userPrompts.length - 1]
    : session.subtitle || session.displayText;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        margin: '0 10px 8px',
        borderRadius: 8,
        borderLeft: isViewing ? '3px solid #a855f7' : '3px solid #34d399',
        background: isViewing ? '#1a1a2e' : '#0f1a15',
        boxShadow: '0 0 12px rgba(52, 211, 153, 0.1)',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isViewing) e.currentTarget.style.background = '#142018';
      }}
      onMouseLeave={(e) => {
        if (!isViewing) e.currentTarget.style.background = '#0f1a15';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={s.liveDot} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.displayText}
        </span>
        {isViewing && (
          <span style={{ fontSize: 8, color: '#a855f7', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
            Viewing
          </span>
        )}
        {onSplitClick && (
          <span
            onClick={(e) => { e.stopPropagation(); onSplitClick(); }}
            title="Open in split pane"
            style={{
              fontSize: 10,
              color: isInSplit ? '#a855f7' : '#475569',
              cursor: 'pointer',
              flexShrink: 0,
              padding: '1px 4px',
              borderRadius: 3,
              border: isInSplit ? '1px solid #a855f7' : '1px solid transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.borderColor = '#a855f740'; }}
            onMouseLeave={(e) => { if (!isInSplit) { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = 'transparent'; } }}
          >
            {'\u29C9'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 15 }}>
        {lastPrompt}
      </div>
      <div style={{ fontSize: 10, color: '#475569', paddingLeft: 15, marginTop: 2 }}>
        {format(new Date(session.timestamp), 'HH:mm')}
        {session.endReason === 'compacted' && (
          <span style={{ color: '#fbbf24', marginLeft: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compacted</span>
        )}
      </div>
    </div>
  );
}

// ─── Past Session Item (with expandable prompts) ────────────────────────

function PastSessionItem({
  session,
  isViewing,
  onClick,
  onSplitClick,
  isInSplit,
}: {
  session: SessionInfo;
  isViewing: boolean;
  onClick: () => void;
  onSplitClick?: () => void;
  isInSplit?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PROMPTS_PER_PAGE);
  const prompts = session.userPrompts || [];
  const promptCount = prompts.length;

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
    setVisibleCount(PROMPTS_PER_PAGE);
  }, []);

  const showMore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setVisibleCount(prev => prev + PROMPTS_PER_PAGE);
  }, []);

  return (
    <div
      style={{
        padding: '8px 14px',
        margin: '0 10px 4px',
        borderRadius: 6,
        borderLeft: isViewing ? '3px solid #a855f7' : '3px solid transparent',
        background: isViewing ? '#1a1a2e' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isViewing) e.currentTarget.style.background = '#161622';
      }}
      onMouseLeave={(e) => {
        if (!isViewing) e.currentTarget.style.background = isViewing ? '#1a1a2e' : 'transparent';
      }}
    >
      {/* Project name */}
      <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
        {session.displayText}
      </div>
      {/* First prompt / subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {session.endReason === 'compacted' && <span style={s.compactedDot} />}
        {session.endReason === 'ended' && <span style={s.endedDot} />}
        <span style={{ fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {session.subtitle || prompts[0] || 'Untitled'}
        </span>
      </div>
      {/* Meta row: time + split button + message count toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <span style={{ fontSize: 10, color: '#475569' }}>
          {format(new Date(session.timestamp), 'MMM d, HH:mm')}
        </span>
        {session.endReason === 'compacted' && (
          <span style={{ fontSize: 9, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compacted</span>
        )}
        {onSplitClick && (
          <span
            onClick={(e) => { e.stopPropagation(); onSplitClick(); }}
            title="Open in split pane"
            style={{
              fontSize: 10,
              color: isInSplit ? '#a855f7' : '#475569',
              cursor: 'pointer',
              padding: '0 3px',
              borderRadius: 3,
              border: isInSplit ? '1px solid #a855f7' : '1px solid transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={(e) => { if (!isInSplit) e.currentTarget.style.color = '#475569'; }}
          >
            {'\u29C9'}
          </span>
        )}
        {promptCount > 1 && (
          <span
            onClick={toggleExpand}
            style={{
              fontSize: 10,
              color: expanded ? '#a855f7' : '#64748b',
              cursor: 'pointer',
              marginLeft: 'auto',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {expanded ? '\u25BE' : '\u25B8'} {promptCount} messages
          </span>
        )}
      </div>
      {/* Expanded prompts list */}
      {expanded && promptCount > 0 && (
        <div style={{ marginTop: 6, paddingLeft: 4, borderLeft: '1px solid #2a2a3e' }}>
          {prompts.slice(0, visibleCount).map((p, i) => (
            <div key={i} style={{
              fontSize: 10,
              color: '#94a3b8',
              padding: '3px 8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: '#475569', marginRight: 4, fontFamily: 'var(--font-mono, monospace)', fontSize: 9 }}>{i + 1}.</span>
              {p}
            </div>
          ))}
          {visibleCount < promptCount && (
            <div
              onClick={showMore}
              style={{
                fontSize: 10,
                color: '#a855f7',
                padding: '4px 8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              Show more ({promptCount - visibleCount} remaining)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main SessionPicker ─────────────────────────────────────────────────

export default function SessionPicker() {
  const sessions = useSessionStore((s) => s.sessions);
  const primarySessionPath = useSessionStore((s) => s.panes.primary.sessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const splitMode = useSessionStore((s) => s.splitMode);
  const secondarySessionPath = useSessionStore((s) => s.panes.secondary.sessionPath);

  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<DateBucket>>(() =>
    new Set<DateBucket>(['thisMonth', 'older']),
  );

  const { activeSessions, dateBuckets } = useMemo(() => {
    const active: SessionInfo[] = [];
    const past: SessionInfo[] = [];

    for (const s of sessions) {
      if (s.endReason === 'active') {
        active.push(s);
      } else {
        past.push(s);
      }
    }

    // Sort active: newest first
    active.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Group past sessions by date bucket
    const buckets = new Map<DateBucket, SessionInfo[]>();
    for (const s of past) {
      const bucket = getDateBucket(s.timestamp);
      const list = buckets.get(bucket) || [];
      list.push(s);
      buckets.set(bucket, list);
    }

    // Sort within each bucket: newest first
    for (const list of buckets.values()) {
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return { activeSessions: active, dateBuckets: buckets };
  }, [sessions]);

  const toggleBucket = useCallback((bucket: DateBucket) => {
    setCollapsedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }, []);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.heading}>Sessions</h2>
      </div>
      <div style={s.list}>
        {/* ── Active Sessions Section ── */}
        {activeSessions.length > 0 && (
          <>
            <div style={s.sectionHeader}>
              <span style={s.activeDotSmall} />
              <span style={{ color: '#34d399' }}>Active</span>
              <span style={s.sectionCount}>{activeSessions.length}</span>
            </div>
            {activeSessions.map((session) => (
              <ActiveSessionCard
                key={session.sessionId}
                session={session}
                isViewing={session.filePath === primarySessionPath}
                onClick={() => setActiveSession('primary', session.filePath)}
                onSplitClick={splitMode ? () => setActiveSession('secondary', session.filePath) : undefined}
                isInSplit={session.filePath === secondarySessionPath}
              />
            ))}
            <div style={s.divider} />
          </>
        )}

        {/* ── Past Sessions by Date ── */}
        {BUCKET_ORDER.map((bucket) => {
          const items = dateBuckets.get(bucket);
          if (!items || items.length === 0) return null;
          const isCollapsed = collapsedBuckets.has(bucket);
          return (
            <div key={bucket}>
              <div
                style={s.sectionHeader}
                onClick={() => toggleBucket(bucket)}
              >
                <span style={s.chevron}>{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                <span>{BUCKET_LABELS[bucket]}</span>
                <span style={s.sectionCount}>{items.length}</span>
              </div>
              {!isCollapsed && items.map((session) => (
                <PastSessionItem
                  key={session.sessionId}
                  session={session}
                  isViewing={session.filePath === primarySessionPath}
                  onClick={() => setActiveSession('primary', session.filePath)}
                  onSplitClick={splitMode ? () => setActiveSession('secondary', session.filePath) : undefined}
                  isInSplit={session.filePath === secondarySessionPath}
                />
              ))}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div style={s.empty}>No sessions found</div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  container: {
    width: 280,
    backgroundColor: '#12121a',
    borderRight: '1px solid #2a2a3e',
    overflowY: 'auto',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    borderBottom: '1px solid #2a2a3e',
  },
  heading: {
    fontSize: 14,
    color: '#e0e0e0',
    margin: 0,
    fontWeight: 600,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  sectionHeader: {
    padding: '10px 16px 6px',
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  sectionCount: {
    fontSize: 9,
    color: '#475569',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: '1px 6px',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  chevron: {
    fontSize: 8,
    color: '#475569',
    width: 10,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: '#2a2a3e',
    margin: '8px 16px',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 8px #34d39980',
    flexShrink: 0,
    animation: 'status-pulse 1.5s ease-in-out infinite',
  },
  activeDotSmall: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 4px #34d39980',
    flexShrink: 0,
  },
  compactedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#fbbf24',
    boxShadow: '0 0 4px rgba(251, 191, 36, 0.4)',
    flexShrink: 0,
  },
  endedDot: {
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#475569',
    flexShrink: 0,
  },
  empty: {
    padding: 16,
    fontSize: 12,
    color: '#475569',
    textAlign: 'center' as const,
  },
};
