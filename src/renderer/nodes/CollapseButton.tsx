import type { CSSProperties } from 'react';
import { useSessionStore } from '../store/session-store';

const btnStyle: CSSProperties = {
  position: 'absolute',
  bottom: -10,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: '1px solid #2a2a3e',
  backgroundColor: '#1a1a2e',
  color: '#888',
  fontSize: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 10,
  lineHeight: 1,
  padding: 0,
  fontFamily: 'inherit',
  transition: 'all 0.15s',
};

const badgeStyle: CSSProperties = {
  position: 'absolute',
  bottom: -10,
  right: -6,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  backgroundColor: '#a855f7',
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  zIndex: 10,
  fontFamily: 'inherit',
};

interface Props {
  nodeId: string;
  childCount: number;
  collapsed: boolean;
}

export default function CollapseButton({ nodeId, childCount, collapsed }: Props) {
  const toggleCollapse = useSessionStore((s) => s.toggleCollapse);

  if (childCount === 0) return null;

  return (
    <>
      <button
        style={btnStyle}
        onClick={(e) => {
          e.stopPropagation();
          toggleCollapse(nodeId);
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#a855f7';
          e.currentTarget.style.color = '#e0e0e0';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#2a2a3e';
          e.currentTarget.style.color = '#888';
        }}
        title={collapsed ? `Expand ${childCount} nodes` : `Collapse ${childCount} nodes`}
      >
        {collapsed ? '+' : '\u2212'}
      </button>
      {collapsed && <span style={badgeStyle}>{childCount}</span>}
    </>
  );
}
