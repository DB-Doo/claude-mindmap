import { useMemo, useState } from 'react';
import { useSessionStore } from '../store/session-store';
import { format } from 'date-fns';
import type { CSSProperties } from 'react';
import type { SessionInfo } from '../../shared/types';

interface SessionGroup {
  project: string;
  displayName: string;
  sessions: SessionInfo[];
  hasActive: boolean;
}

export default function SessionPicker() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    // Group sessions by project path
    const projectMap = new Map<string, SessionInfo[]>();
    for (const s of sessions) {
      const list = projectMap.get(s.project) || [];
      list.push(s);
      projectMap.set(s.project, list);
    }

    const result: SessionGroup[] = [];
    for (const [project, sessionList] of projectMap) {
      // Sort within group: newest first
      sessionList.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      result.push({
        project,
        displayName: sessionList[0].displayText || 'Untitled Project',
        sessions: sessionList,
        hasActive: sessionList.some((s) => s.endReason === 'active'),
      });
    }

    // Sort groups: active first, then by newest session timestamp
    result.sort((a, b) => {
      if (a.hasActive && !b.hasActive) return -1;
      if (!a.hasActive && b.hasActive) return 1;
      const aTime = new Date(a.sessions[0].timestamp).getTime();
      const bTime = new Date(b.sessions[0].timestamp).getTime();
      return bTime - aTime;
    });

    return result;
  }, [sessions]);

  const toggleGroup = (project: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  const renderItem = (s: SessionInfo, showChain: boolean) => {
    const isSelected = s.filePath === activeSessionPath;
    return (
      <div
        key={s.sessionId}
        style={{
          ...styles.item,
          ...(isSelected ? styles.itemActive : {}),
        }}
        onClick={() => {
          setActiveSession(s.filePath);
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '#1a1a2e';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={styles.itemRow}>
          {showChain && <span style={styles.chainIcon}>{'\u2514'}</span>}
          {s.endReason === 'active' && <span style={styles.liveDot} />}
          {s.endReason === 'compacted' && <span style={styles.compactedDot} />}
          {s.endReason === 'ended' && <span style={styles.endedDot} />}
          <div style={styles.display}>
            {s.subtitle || s.displayText || 'Untitled'}
          </div>
        </div>
        <div style={styles.meta}>
          <span style={styles.time}>
            {format(new Date(s.timestamp), 'MMM d, HH:mm')}
          </span>
          {s.endReason === 'compacted' && (
            <span style={styles.compactedBadge}>Compacted</span>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (group: SessionGroup) => {
    const isCollapsed = collapsedGroups.has(group.project);
    const chevron = isCollapsed ? '\u25B6' : '\u25BC';
    return (
      <div key={group.project}>
        <div
          style={styles.groupHeader}
          onClick={() => toggleGroup(group.project)}
        >
          <span style={styles.chevron}>{chevron}</span>
          {group.hasActive && <span style={styles.liveDotSmall} />}
          <span style={styles.groupName}>{group.displayName}</span>
          <span style={styles.sessionCount}>{group.sessions.length}</span>
        </div>
        {!isCollapsed &&
          group.sessions.map((s, i) => renderItem(s, i > 0))}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Sessions</h2>
      </div>
      <div style={styles.list}>
        {groups.map(renderGroup)}
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
  groupHeader: {
    padding: '10px 16px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: '#ccc',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    borderBottom: '1px solid #1a1a2e',
    userSelect: 'none' as const,
  },
  chevron: {
    fontSize: 8,
    color: '#888',
    width: 10,
    flexShrink: 0,
  },
  groupName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  sessionCount: {
    fontSize: 9,
    color: '#666',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: '1px 6px',
    flexShrink: 0,
  },
  item: {
    padding: '8px 16px 8px 28px',
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
    gap: 6,
  },
  chainIcon: {
    fontSize: 10,
    color: '#555',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  display: {
    fontSize: 11,
    color: '#e0e0e0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  meta: {
    marginTop: 3,
    paddingLeft: 14,
  },
  time: {
    fontSize: 10,
    color: '#888',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 6px #34d39980',
    flexShrink: 0,
    animation: 'status-pulse 1.5s ease-in-out infinite',
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 4px #34d39980',
    flexShrink: 0,
  },
  compactedDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#fbbf24',
    boxShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
    flexShrink: 0,
  },
  endedDot: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#555',
    flexShrink: 0,
  },
  compactedBadge: {
    fontSize: 9,
    color: '#fbbf24',
    marginLeft: 8,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  empty: {
    padding: 16,
    fontSize: 12,
    color: '#888',
    textAlign: 'center' as const,
  },
};
