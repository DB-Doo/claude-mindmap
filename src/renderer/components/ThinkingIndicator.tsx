import { useEffect } from 'react';
import { useSessionStore, LiveActivity } from '../store/session-store';

const ACTIVITY_CONFIG: Record<LiveActivity, { label: string; icon: string; color: string } | null> = {
  idle: null,
  thinking: { label: 'Claude is thinking', icon: '🧠', color: '#a855f7' },
  tool_running: { label: 'Running tool', icon: '⚡', color: '#ff6b35' },
  responding: { label: 'Claude is responding', icon: '💬', color: '#00d4ff' },
  waiting_on_user: { label: 'Waiting on you', icon: '⏳', color: '#34d399' },
};

const IDLE_TIMEOUT = 5000;

export default function ThinkingIndicator() {
  const liveActivity = useSessionStore((s) => s.liveActivity);
  const lastActivityTime = useSessionStore((s) => s.lastActivityTime);
  const setIdle = useSessionStore((s) => s.setIdle);

  // Auto-reset to idle if no new messages arrive for a few seconds.
  // "waiting_on_user" persists until the user sends a new message.
  useEffect(() => {
    if (liveActivity === 'idle' || liveActivity === 'waiting_on_user') return;

    const timer = setTimeout(() => {
      setIdle();
    }, IDLE_TIMEOUT);

    return () => clearTimeout(timer);
  }, [liveActivity, lastActivityTime, setIdle]);

  const config = ACTIVITY_CONFIG[liveActivity];
  if (!config) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 52,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 20px',
      background: 'rgba(10, 10, 15, 0.9)',
      border: `1px solid ${config.color}`,
      borderRadius: 20,
      boxShadow: `0 0 15px ${config.color}40, 0 0 30px ${config.color}20`,
      backdropFilter: 'blur(8px)',
      animation: 'indicator-pulse 2s ease-in-out infinite',
    }}>
      <span style={{
        fontSize: 18,
        animation: liveActivity === 'thinking' ? 'indicator-bounce 1s ease-in-out infinite' : undefined,
      }}>
        {config.icon}
      </span>
      <span style={{
        fontSize: 12,
        fontFamily: 'var(--font-mono, monospace)',
        color: config.color,
        fontWeight: 600,
        letterSpacing: '0.5px',
      }}>
        {config.label}
      </span>
      <span style={{
        display: 'flex',
        gap: 3,
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: config.color,
            animation: `indicator-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </span>
    </div>
  );
}
