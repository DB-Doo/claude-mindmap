import { useSessionStore, LiveActivity } from '../store/session-store';

const ACTIVITY_CONFIG: Record<LiveActivity, { label: string; icon: string; color: string }> = {
  idle: { label: 'Active', icon: '🟢', color: '#475569' },
  thinking: { label: 'Claude is thinking', icon: '🧠', color: '#a855f7' },
  tool_running: { label: 'Running tool', icon: '⚡', color: '#ff6b35' },
  responding: { label: 'Claude is responding', icon: '💬', color: '#00d4ff' },
  waiting_on_user: { label: 'Waiting on you', icon: '⏳', color: '#34d399' },
  compacting: { label: 'Compacting conversation', icon: '📋', color: '#fbbf24' },
};

function ActivityBanner({
  config,
  activity,
  sessionName,
  isBackground,
  onClick,
}: {
  config: { label: string; icon: string; color: string };
  activity: LiveActivity;
  sessionName?: string;
  isBackground?: boolean;
  onClick?: () => void;
}) {
  const isIdle = activity === 'idle';
  const label = sessionName ? `${sessionName} — ${config.label}` : config.label;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isBackground ? 8 : 10,
        padding: isBackground ? '5px 14px' : '8px 20px',
        background: 'rgba(10, 10, 15, 0.9)',
        border: `1px solid ${config.color}`,
        borderRadius: 20,
        boxShadow: isIdle ? 'none' : `0 0 15px ${config.color}40, 0 0 30px ${config.color}20`,
        backdropFilter: 'blur(8px)',
        animation: isIdle ? undefined : 'indicator-pulse 2s ease-in-out infinite',
        opacity: isBackground ? 0.8 : 1,
        cursor: 'pointer',
        transition: 'opacity 0.2s, transform 0.2s',
      }}
    >
      <span style={{
        fontSize: isBackground ? 14 : 18,
        animation: activity === 'thinking' ? 'indicator-bounce 1s ease-in-out infinite' : undefined,
      }}>
        {config.icon}
      </span>
      <span style={{
        fontSize: isBackground ? 10 : 12,
        fontFamily: 'var(--font-mono, monospace)',
        color: config.color,
        fontWeight: 600,
        letterSpacing: '0.5px',
        maxWidth: isBackground ? 240 : undefined,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {!isIdle && (
        <span style={{ display: 'flex', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{
              width: isBackground ? 3 : 4,
              height: isBackground ? 3 : 4,
              borderRadius: '50%',
              backgroundColor: config.color,
              animation: `indicator-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </span>
      )}
    </div>
  );
}

export default function ThinkingIndicator() {
  const backgroundActivities = useSessionStore((s) => s.backgroundActivities);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const liveActivity = useSessionStore((s) => s.liveActivity);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const requestCenter = useSessionStore((s) => s.requestCenter);

  const entries = Array.from(backgroundActivities.entries())
    .map(([filePath, { activity, sessionName }]) => {
      // For the current session, use real-time liveActivity (updated on every
      // message append) instead of the polled value (3s interval, 5-msg tail).
      const isCurrent = filePath === activeSessionPath;
      const resolvedActivity = isCurrent ? liveActivity : activity;
      return {
        filePath,
        activity: resolvedActivity,
        sessionName,
        config: ACTIVITY_CONFIG[resolvedActivity],
        isCurrent,
      };
    });

  if (entries.length === 0) return null;

  // Sort: current session first, then others
  entries.sort((a, b) => (a.isCurrent === b.isCurrent ? 0 : a.isCurrent ? -1 : 1));

  return (
    <div style={{
      position: 'absolute',
      top: 52,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    }}>
      {entries.map((entry) => (
        <ActivityBanner
          key={entry.filePath}
          config={entry.config}
          activity={entry.activity}
          sessionName={entry.sessionName}
          isBackground={!entry.isCurrent}
          onClick={entry.isCurrent
            ? () => requestCenter()
            : () => { useSessionStore.setState({ centerOnLoad: true }); setActiveSession(entry.filePath); }}
        />
      ))}
    </div>
  );
}
