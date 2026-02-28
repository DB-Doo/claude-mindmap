import { useSessionStore } from '../store/session-store';
import SessionCanvas from './SessionCanvas';

// ─── Empty State ──────────────────────────────────────────────────────

function EmptySecondary() {
  const sessions = useSessionStore((s) => s.sessions);
  const primarySessionPath = useSessionStore((s) => s.panes.primary.sessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const otherSessions = sessions.filter((s) => s.filePath !== primarySessionPath);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: '#475569',
      fontSize: 12,
      backgroundColor: '#0a0a0f',
    }}>
      <span style={{ fontSize: 24 }}>{'\u2B50'}</span>
      <span>Select a session for the secondary pane</span>
      {otherSessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {otherSessions.slice(0, 8).map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setActiveSession('secondary', s.filePath)}
              style={{
                background: 'rgba(168, 85, 247, 0.05)',
                border: '1px solid #2a2a3e',
                borderRadius: 4,
                color: '#94a3b8',
                fontSize: 10,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#e0e0e0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.color = '#94a3b8'; }}
            >
              {s.endReason === 'active' ? '\uD83D\uDFE2 ' : ''}{s.displayText}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main SecondaryPane ──────────────────────────────────────────────

export default function SecondaryPane() {
  const secondarySessionPath = useSessionStore((s) => s.panes.secondary.sessionPath);

  if (!secondarySessionPath) {
    return <EmptySecondary />;
  }

  return <SessionCanvas paneId="secondary" />;
}
