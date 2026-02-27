import type { CSSProperties } from 'react';
import { useSessionStore } from '../store/session-store';
import { TOOL_COLORS } from '../../shared/types';

const panelStyle: CSSProperties = {
  width: 360,
  backgroundColor: '#12121a',
  borderLeft: '1px solid #2a2a3e',
  overflowY: 'auto',
  padding: 16,
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
  fontSize: 14,
  fontWeight: 'bold',
};

const closeBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 16,
  padding: 4,
};

const statusStyle: CSSProperties = {
  fontSize: 11,
  marginBottom: 12,
};

const sectionStyle: CSSProperties = {
  marginBottom: 16,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 4,
};

const contentStyle: CSSProperties = {
  fontSize: 12,
  color: '#e0e0e0',
  wordBreak: 'break-word',
};

const preStyle: CSSProperties = {
  fontSize: 11,
  color: '#e0e0e0',
  backgroundColor: '#0a0a0f',
  padding: 12,
  borderRadius: 6,
  overflowX: 'auto',
  maxHeight: 400,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
};

export default function NodeDetails() {
  const selectedNodeId = useSessionStore(s => s.selectedNodeId);
  const nodes = useSessionStore(s => s.nodes);
  const selectNode = useSessionStore(s => s.selectNode);

  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const color = node.toolName
    ? (TOOL_COLORS[node.toolName] || TOOL_COLORS.default)
    : '#6b7280';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ color }}>
          {node.kind === 'tool_use' ? node.toolName : node.kind}
        </span>
        <button onClick={() => selectNode(null)} style={closeBtnStyle}>
          {'✕'}
        </button>
      </div>
      {node.status && (
        <div style={{
          ...statusStyle,
          color: node.status === 'error' ? '#ff3d71' : '#34d399',
        }}>
          Status: {node.status}
        </div>
      )}
      <div style={sectionStyle}>
        <div style={labelStyle}>Label</div>
        <div style={contentStyle}>{node.label}</div>
      </div>
      {node.detail && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Detail</div>
          <pre style={preStyle}>{node.detail}</pre>
        </div>
      )}
      <div style={sectionStyle}>
        <div style={labelStyle}>Timestamp</div>
        <div style={contentStyle}>{node.timestamp}</div>
      </div>
    </div>
  );
}
