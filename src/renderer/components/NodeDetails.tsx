import type { CSSProperties } from 'react';
import { useSessionStore, useFocusedPane } from '../store/session-store';
import { TOOL_COLORS } from '../../shared/types';

const panelStyle: CSSProperties = {
  width: 360,
  backgroundColor: '#12121a',
  borderLeft: '1px solid #2a2a3e',
  overflowY: 'auto',
  padding: 16,
  flexShrink: 0,
};

const collapsedStyle: CSSProperties = {
  width: 0,
  padding: 0,
  overflow: 'hidden',
  flexShrink: 0,
  borderLeft: 'none',
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
  const selectNode = useSessionStore(s => s.selectNode);

  // Derived selector: only re-renders when the selected node's content changes
  const node = useSessionStore(s => {
    const pane = s.panes[s.focusedPane];
    if (!pane.selectedNodeId) return null;
    return pane.nodes.find(n => n.id === pane.selectedNodeId) ?? null;
  });

  // Get the assistant reply for user nodes by traversing the edge chain
  // (user → thinking → text → tool_use → ...) until the next user node.
  const replyDetail = useSessionStore(s => {
    const pane = s.panes[s.focusedPane];
    if (!pane.selectedNodeId) return null;
    const selectedNode = pane.nodes.find(n => n.id === pane.selectedNodeId);
    if (!selectedNode || selectedNode.kind !== 'user') return null;

    // Build adjacency map once
    const childMap = new Map<string, string[]>();
    for (const e of pane.edges) {
      const list = childMap.get(e.source);
      if (list) list.push(e.target);
      else childMap.set(e.source, [e.target]);
    }

    const nodeMap = new Map(pane.nodes.map(n => [n.id, n]));
    const textDetails: string[] = [];
    const queue = [pane.selectedNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const n = nodeMap.get(id);
      if (!n) continue;
      // Stop at the next user node (don't traverse into the next column)
      if (n.kind === 'user' && id !== pane.selectedNodeId) continue;
      if (n.kind === 'text') textDetails.push(n.detail);
      const children = childMap.get(id);
      if (children) for (const child of children) queue.push(child);
    }

    if (textDetails.length === 0) return null;
    return textDetails.join('\n\n');
  });

  // Always render the container to keep a stable flex layout.
  // Collapsed (width: 0) when no node selected, expanded (360px) when selected.
  if (!node) return <div style={collapsedStyle} />;

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
          {'\u2715'}
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
      {node.replyToSnippet && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Replying To</div>
          <pre style={{
            ...preStyle,
            borderLeft: '3px solid #a855f7',
            fontStyle: 'italic',
            color: '#94a3b8',
          }}>{node.replyToSnippet}</pre>
        </div>
      )}
      <div style={sectionStyle}>
        <div style={labelStyle}>Timestamp</div>
        <div style={contentStyle}>{node.timestamp}</div>
      </div>
      {replyDetail && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Claude's Reply</div>
          <pre style={{
            ...preStyle,
            borderLeft: '3px solid #34d399',
            maxHeight: 500,
          }}>{replyDetail}</pre>
        </div>
      )}
    </div>
  );
}
