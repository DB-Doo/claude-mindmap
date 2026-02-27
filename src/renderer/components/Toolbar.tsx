import type { CSSProperties } from 'react';
import { useSessionStore } from '../store/session-store';

const toolbarStyle: CSSProperties = {
  height: 40,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  backgroundColor: '#12121a',
  borderBottom: '1px solid #2a2a3e',
  flexShrink: 0,
};

const btn: CSSProperties = {
  padding: '4px 10px',
  backgroundColor: 'transparent',
  color: '#888',
  border: '1px solid #2a2a3e',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  transition: 'all 0.15s',
};

const activeBtn: CSSProperties = {
  ...btn,
  color: '#e0e0e0',
  borderColor: '#a855f7',
  backgroundColor: 'rgba(168, 85, 247, 0.1)',
};

const groupStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 20,
  backgroundColor: '#2a2a3e',
};

const nodeCountStyle: CSSProperties = {
  marginLeft: 'auto',
  color: '#888',
  fontSize: 11,
};

export default function Toolbar() {
  const direction = useSessionStore(s => s.layoutDirection);
  const setDirection = useSessionStore(s => s.setLayoutDirection);
  const showThinking = useSessionStore(s => s.showThinking);
  const showText = useSessionStore(s => s.showText);
  const showSystem = useSessionStore(s => s.showSystem);
  const autoFollow = useSessionStore(s => s.autoFollow);
  const toggleShowThinking = useSessionStore(s => s.toggleShowThinking);
  const toggleShowText = useSessionStore(s => s.toggleShowText);
  const toggleShowSystem = useSessionStore(s => s.toggleShowSystem);
  const toggleAutoFollow = useSessionStore(s => s.toggleAutoFollow);
  const nodeCount = useSessionStore(s => s.nodes.length);

  return (
    <div style={toolbarStyle}>
      <div style={groupStyle}>
        <button
          style={direction === 'TB' ? activeBtn : btn}
          onClick={() => setDirection('TB')}
        >
          {'↕'} Vertical
        </button>
        <button
          style={direction === 'LR' ? activeBtn : btn}
          onClick={() => setDirection('LR')}
        >
          {'↔'} Horizontal
        </button>
      </div>
      <div style={dividerStyle} />
      <div style={groupStyle}>
        <button style={showThinking ? activeBtn : btn} onClick={toggleShowThinking}>
          Thinking
        </button>
        <button style={showText ? activeBtn : btn} onClick={toggleShowText}>
          Text
        </button>
        <button style={showSystem ? activeBtn : btn} onClick={toggleShowSystem}>
          System
        </button>
      </div>
      <div style={dividerStyle} />
      <button style={autoFollow ? activeBtn : btn} onClick={toggleAutoFollow}>
        Auto-follow
      </button>
      <div style={nodeCountStyle}>
        {nodeCount} nodes
      </div>
    </div>
  );
}
