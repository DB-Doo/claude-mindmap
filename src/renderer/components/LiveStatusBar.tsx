import { useState, useEffect } from 'react';
import { useSessionStore, type LiveActivity } from '../store/session-store';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

const ACTIVITY_LABELS: Record<LiveActivity, string> = {
  idle: 'Active',
  thinking: 'Thinking',
  tool_running: 'Running',
  responding: 'Responding',
  waiting_on_user: 'Waiting',
  compacting: 'Compacting',
};

const ACTIVITY_COLORS: Record<LiveActivity, string> = {
  idle: '#475569',
  thinking: '#a855f7',
  tool_running: '#ff6b35',
  responding: '#00d4ff',
  waiting_on_user: '#34d399',
  compacting: '#fbbf24',
};

export default function LiveStatusBar() {
  const liveActivity = useSessionStore(s => s.liveActivity);
  const liveActivityDetail = useSessionStore(s => s.liveActivityDetail);
  const turnStartTime = useSessionStore(s => s.turnStartTime);
  const turnOutputTokens = useSessionStore(s => s.turnOutputTokens);
  const turnThinkingMs = useSessionStore(s => s.turnThinkingMs);
  const thinkingStartedAt = useSessionStore(s => s._thinkingStartedAt);

  const [now, setNow] = useState(Date.now());

  const isActive = liveActivity !== 'idle' && liveActivity !== 'waiting_on_user';

  // Tick every second when active
  useEffect(() => {
    if (!isActive || turnStartTime === 0) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive, turnStartTime]);

  if (!isActive || turnStartTime === 0) return null;

  const elapsed = now - turnStartTime;
  const thinkingTotal = turnThinkingMs + (thinkingStartedAt ? now - thinkingStartedAt : 0);

  let label = ACTIVITY_LABELS[liveActivity];
  if (liveActivity === 'tool_running' && liveActivityDetail) {
    label = `Running ${liveActivityDetail}`;
  }

  const color = ACTIVITY_COLORS[liveActivity];

  const parts: string[] = [formatElapsed(elapsed)];
  if (turnOutputTokens > 0) {
    parts.push(`\u2191 ${formatTokens(turnOutputTokens)} tokens`);
  }
  if (thinkingTotal >= 1000) {
    parts.push(`thought for ${formatElapsed(thinkingTotal)}`);
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 16px',
      background: 'rgba(10, 10, 15, 0.9)',
      border: `1px solid ${color}40`,
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: `0 0 12px ${color}20`,
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 12,
      whiteSpace: 'nowrap',
      animation: 'indicator-pulse 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite',
    }}>
      <span style={{ color, fontSize: 14 }}>{'\u2726'}</span>
      <span style={{ color, fontWeight: 600 }}>
        {label}{'\u2026'}
      </span>
      <span style={{ color: '#666' }}>
        ({parts.join(' \u00B7 ')})
      </span>
    </div>
  );
}
