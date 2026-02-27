import { useMemo } from 'react';
import { useSessionStore } from '../store/session-store';
import { format } from 'date-fns';
import type { CSSProperties } from 'react';
import type { SessionInfo } from '../../shared/types';

// A session is "active" if its file was modified in the last 5 minutes.
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

export default function SessionPicker() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const { active, history } = useMemo(() => {
    const now = Date.now();
    const active: SessionInfo[] = [];
    const history: SessionInfo[] = [];
    for (const s of sessions) {
      if (now - s.lastModified < ACTIVE_THRESHOLD_MS) {
        active.push(s);
      } else {
        history.push(s);
      }
    }
    return { active, history };
  }, [sessions]);

  const renderItem = (s: SessionInfo) => {
    const isSelected = s.filePath === activeSessionPath;
    const isLive = Date.now() - s.lastModified < ACTIVE_THRESHOLD_MS;
    return (
      <div
        key={s.sessionId}
        style={{
          ...styles.item,
          ...(isSelected ? styles.itemActive : {}),
        }}
        onClick={() => setActiveSession(s.filePath)}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '#1a1a2e';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={styles.itemRow}>
          {isLive && <span style={styles.liveDot} />}
          <div style={styles.display}>
            {s.displayText || 'Untitled Session'}
          </div>
        </div>
        {s.subtitle && (
          <div style={styles.subtitle}>{s.subtitle}</div>
        )}
        <div style={styles.meta}>
          <span style={styles.time}>
            {format(new Date(s.timestamp), 'MMM d, HH:mm')}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Sessions</h2>
      </div>
      <div style={styles.list}>
        {active.length > 0 && (
          <>
            <div style={styles.sectionHeader}>
              <span style={styles.liveDotSmall} />
              Active
            </div>
            {active.map(renderItem)}
          </>
        )}
        {history.length > 0 && (
          <>
            <div style={styles.sectionHeader}>History</div>
            {history.map(renderItem)}
          </>
        )}
        {sessions.length === 0 && (
          <div style={styles.empty}>No sessions found</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
  },
  sectionHeader: {
    padding: '10px 16px 6px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderBottom: '1px solid #1a1a2e',
  },
  item: {
    padding: '10px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #1a1a2e',
    transition: 'background-color 0.15s',
  },
  itemActive: {
    backgroundColor: '#1a1a2e',
    borderLeft: '2px solid #a855f7',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  display: {
    fontSize: 12,
    color: '#e0e0e0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  subtitle: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  meta: {
    marginTop: 4,
  },
  time: {
    fontSize: 10,
    color: '#888',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 6px #34d39980',
    flexShrink: 0,
    animation: 'status-pulse 1.5s ease-in-out infinite',
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 4px #34d39980',
    flexShrink: 0,
  },
  empty: {
    padding: 16,
    fontSize: 12,
    color: '#888',
    textAlign: 'center' as const,
  },
};
