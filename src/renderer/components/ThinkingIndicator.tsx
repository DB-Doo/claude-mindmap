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

  // Current session: larger, more prominent banner
  const fontSize = isCurrent ? 13 : 11;
  const padding = isCurrent ? '10px 16px' : '7px 12px';
  const maxW = isCurrent ? 520 : 380;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: isCurrent ? 'rgba(10, 10, 18, 0.97)' : 'rgba(10, 10, 15, 0.95)',
        border: isCurrent ? `2px solid ${config.color}` : `1.5px solid ${borderColor}`,
        borderRadius: isCurrent ? 10 : 8,
        boxShadow: isCurrent
          ? `0 0 20px ${config.color}60, 0 0 40px ${config.color}30, 0 6px 16px rgba(0,0,0,0.6)`
          : `0 0 8px ${config.color}30, 0 4px 12px rgba(0,0,0,0.4)`,
        backdropFilter: 'blur(12px)',
        cursor: 'pointer',
        transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        opacity: isCurrent ? 1 : 0.75,
        overflow: 'hidden',
        maxWidth: maxW,
      }}
    >
      {/* Left: VIEWING label for current session, or session prompt */}
      <div style={{
        padding,
        fontSize,
        fontFamily: 'var(--font-mono, monospace)',
        color: isCurrent ? '#f1f5f9' : '#94a3b8',
        maxWidth: isCurrent ? 320 : 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRight: `1px solid ${borderColor}40`,
      }}>
        {isCurrent && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '1.5px',
            color: '#f1f5f9',
            textTransform: 'uppercase',
            flexShrink: 0,
            background: `${config.color}30`,
            padding: '2px 6px',
            borderRadius: 4,
          }}>
            VIEWING
          </span>
        )}
        {sessionName || 'Session'}
      </div>
      {/* Right: what Claude is doing */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding,
        background: isCurrent ? `${config.color}15` : `${config.color}0a`,
      }}>
        <span style={{
          fontSize: isCurrent ? 16 : 13,
          animation: activity === 'thinking' ? 'indicator-bounce 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite' : undefined,
          lineHeight: 1,
        }}>
          {config.icon}
        </span>
        <span style={{
          fontSize,
          fontFamily: 'var(--font-mono, monospace)',
          color: config.color,
          fontWeight: 700,
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
        }}>
          {activityLabel}
        </span>
        {!isIdle && activity !== 'waiting_on_user' && (
          <span style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: isCurrent ? 4 : 3,
                height: isCurrent ? 4 : 3,
                borderRadius: '50%',
                backgroundColor: config.color,
                animation: `indicator-dot 1.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${i * 0.25}s infinite`,
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
      zIndex: 50,
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
