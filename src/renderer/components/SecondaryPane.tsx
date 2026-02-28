import { useState, useEffect, useRef } from 'react';
import { useSessionStore, type LiveActivity } from '../store/session-store';
import SessionCanvas from './SessionCanvas';

const ACTIVITY_COLORS: Record<LiveActivity, string> = {
  idle: '#475569',
  thinking: '#a855f7',
  tool_running: '#ff6b35',
  responding: '#00d4ff',
  waiting_on_user: '#34d399',
  compacting: '#fbbf24',
};

// ─── Secondary Header ─────────────────────────────────────────────────

function SecondaryHeader({
  sessionName,
  activity,
  onSwap,
}: {
  sessionName: string;
  activity: LiveActivity;
  onSwap: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sessions = useSessionStore((s) => s.sessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const primarySessionPath = useSessionStore((s) => s.panes.primary.sessionPath);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const actColor = ACTIVITY_COLORS[activity];

  return (
    <div style={{
      height: 32,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 8px',
      backgroundColor: '#12121a',
      borderBottom: '1px solid #2a2a3e',
      fontSize: 11,
      flexShrink: 0,
      position: 'relative',
    }}>
      {activity !== 'idle' && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: actColor,
          boxShadow: `0 0 6px ${actColor}80`,
          flexShrink: 0,
        }} />
      )}
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          color: '#e0e0e0',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '2px 4px',
          borderRadius: 3,
        }}
      >
        {sessionName} <span style={{ color: '#475569', fontSize: 9 }}>{'\u25BE'}</span>
      </button>
      <button
        onClick={onSwap}
        title="Promote to primary pane"
        style={{
          background: 'none',
          border: '1px solid #2a2a3e',
          color: '#888',
          fontSize: 12,
          cursor: 'pointer',
          borderRadius: 4,
          padding: '1px 6px',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#e0e0e0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.color = '#888'; }}
      >
        {'\u21C4'}
      </button>
      {pickerOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            right: 0,
            maxHeight: 300,
            overflowY: 'auto',
            backgroundColor: '#12121a',
            border: '1px solid #2a2a3e',
            borderRadius: '0 0 6px 6px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {sessions
            .filter((s) => s.filePath !== primarySessionPath)
            .map((s) => {
              const lastPrompt = s.userPrompts?.length
                ? s.userPrompts[s.userPrompts.length - 1]
                : s.subtitle || s.displayText;
              return (
                <div
                  key={s.sessionId}
                  onClick={() => {
                    setActiveSession('secondary', s.filePath);
                    setPickerOpen(false);
                  }}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #1a1a2e',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a2e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2,
                  }}>
                    {s.endReason === 'active' && (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#34d399',
                        boxShadow: '0 0 4px #34d39980',
                        flexShrink: 0,
                      }} />
                    )}
                    <span style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.displayText}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: s.endReason === 'active' ? 12 : 0 }}>
                    {lastPrompt}
                  </div>
                </div>
              );
            })}
          {sessions.filter((s) => s.filePath !== primarySessionPath).length === 0 && (
            <div style={{ padding: 12, fontSize: 10, color: '#475569', textAlign: 'center' }}>
              No other sessions
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
      borderLeft: '2px solid #2a2a3e',
      backgroundColor: '#0a0a0f',
      minWidth: 300,
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
  const sessions = useSessionStore((s) => s.sessions);
  const swapPanes = useSessionStore((s) => s.swapPanes);
  const liveActivity = useSessionStore((s) => s.panes.secondary.liveActivity);

  if (!secondarySessionPath) {
    return <EmptySecondary />;
  }

  const sessionInfo = sessions.find((s) => s.filePath === secondarySessionPath);
  const sessionName = sessionInfo?.displayText || 'Secondary';

  const borderColor = liveActivity !== 'idle' && liveActivity !== 'waiting_on_user'
    ? ACTIVITY_COLORS[liveActivity]
    : '#2a2a3e';

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 300,
      borderLeft: `2px solid ${borderColor}`,
      transition: 'border-color 0.3s',
    }}>
      <SecondaryHeader
        sessionName={sessionName}
        activity={liveActivity}
        onSwap={swapPanes}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <SessionCanvas paneId="secondary" />
      </div>
    </div>
  );
}
