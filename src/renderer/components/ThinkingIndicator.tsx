import { useSessionStore, LiveActivity } from '../store/session-store';

const ACTIVITY_CONFIG: Record<LiveActivity, { label: string; icon: string; color: string } | null> = {
  idle: null,
  thinking: { label: 'Claude is thinking', icon: '🧠', color: '#a855f7' },
  tool_running: { label: 'Running tool', icon: '⚡', color: '#ff6b35' },
  responding: { label: 'Claude is responding', icon: '💬', color: '#00d4ff' },
  waiting_on_user: { label: 'Waiting on you', icon: '⏳', color: '#34d399' },
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
        boxShadow: `0 0 15px ${config.color}40, 0 0 30px ${config.color}20`,
        backdropFilter: 'blur(8px)',
        animation: 'indicator-pulse 2s ease-in-out infinite',
        opacity: isBackground ? 0.8 : 1,
        cursor: isBackground ? 'pointer' : 'default',
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
    </div>
  );
}

export default function ThinkingIndicator() {
  const backgroundActivities = useSessionStore((s) => s.backgroundActivities);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const entries = Array.from(backgroundActivities.entries())
    .map(([filePath, { activity, sessionName }]) => ({
      filePath,
      activity,
      sessionName,
      config: ACTIVITY_CONFIG[activity],
      isCurrent: filePath === activeSessionPath,
    }))
    .filter((e) => e.config != null);

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
          config={entry.config!}
          activity={entry.activity}
          sessionName={entry.sessionName}
          isBackground={!entry.isCurrent}
          onClick={entry.isCurrent ? undefined : () => setActiveSession(entry.filePath)}
        />
      ))}
    </div>
  );
}
