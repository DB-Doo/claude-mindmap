import { useSessionStore, LiveActivity } from '../store/session-store';

const ACTIVITY_CONFIG: Record<LiveActivity, { label: string; icon: string; color: string }> = {
  idle: { label: 'Active', icon: '🟢', color: '#475569' },
  thinking: { label: 'Thinking', icon: '🧠', color: '#a855f7' },
  tool_running: { label: 'Running tool', icon: '⚡', color: '#ff6b35' },
  responding: { label: 'Responding', icon: '💬', color: '#00d4ff' },
  waiting_on_user: { label: 'Waiting on you', icon: '⏳', color: '#34d399' },
  compacting: { label: 'Compacting', icon: '📋', color: '#fbbf24' },
};

function buildLabel(activity: LiveActivity, detail?: string): string {
  if (activity === 'tool_running' && detail) {
    return `Running ${detail}`;
  }
  return ACTIVITY_CONFIG[activity].label;
}

function ActivityBanner({
  config,
  activity,
  detail,
  sessionName,
  isCurrent,
  onClick,
}: {
  config: { label: string; icon: string; color: string };
  activity: LiveActivity;
  detail?: string;
  sessionName?: string;
  isCurrent?: boolean;
  onClick?: () => void;
}) {
  const isIdle = activity === 'idle';
  const activityLabel = buildLabel(activity, detail);

  const borderColor = isCurrent ? config.color : `${config.color}50`;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'rgba(10, 10, 15, 0.85)',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        boxShadow: isCurrent
          ? `0 0 12px ${config.color}40, 0 0 24px ${config.color}20`
          : (isIdle ? 'none' : `0 0 8px ${config.color}20`),
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        transition: 'opacity 0.2s, transform 0.2s',
        opacity: isCurrent ? 1 : 0.7,
        overflow: 'hidden',
        maxWidth: 420,
      }}
    >
      {/* Left: "VIEWING" tag for current session, or session prompt */}
      <div style={{
        padding: '6px 10px',
        fontSize: 10,
        fontFamily: 'var(--font-mono, monospace)',
        color: isCurrent ? '#e2e8f0' : '#94a3b8',
        maxWidth: 240,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRight: `1px solid ${borderColor}40`,
      }}>
        {isCurrent && (
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '1px',
            color: config.color,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {'\u25C9'}
          </span>
        )}
        {sessionName || 'Session'}
      </div>
      {/* Right: what Claude is doing */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: `${config.color}08`,
      }}>
        <span style={{
          fontSize: 13,
          animation: activity === 'thinking' ? 'indicator-bounce 1s ease-in-out infinite' : undefined,
          lineHeight: 1,
        }}>
          {config.icon}
        </span>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono, monospace)',
          color: config.color,
          fontWeight: 600,
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
        }}>
          {activityLabel}
        </span>
        {!isIdle && (
          <span style={{ display: 'flex', gap: 2 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                backgroundColor: config.color,
                animation: `indicator-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ThinkingIndicator() {
  const backgroundActivities = useSessionStore((s) => s.backgroundActivities);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const liveActivity = useSessionStore((s) => s.liveActivity);
  const liveActivityDetail = useSessionStore((s) => s.liveActivityDetail);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const requestCenter = useSessionStore((s) => s.requestCenter);

  const entries = Array.from(backgroundActivities.entries())
    .map(([filePath, { activity, detail, sessionName }]) => {
      const isCurrent = filePath === activeSessionPath;
      const resolvedActivity = isCurrent ? liveActivity : activity;
      const resolvedDetail = isCurrent ? liveActivityDetail : detail;
      return {
        filePath,
        activity: resolvedActivity,
        detail: resolvedDetail,
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
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: '90%',
    }}>
      {entries.map((entry) => (
        <ActivityBanner
          key={entry.filePath}
          config={entry.config}
          activity={entry.activity}
          detail={entry.detail}
          sessionName={entry.sessionName}
          isCurrent={entry.isCurrent}
          onClick={entry.isCurrent
            ? () => requestCenter()
            : () => { useSessionStore.setState({ centerOnLoad: true }); setActiveSession(entry.filePath); }}
        />
      ))}
    </div>
  );
}
