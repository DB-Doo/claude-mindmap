import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSessionStore, useFocusedPane } from '../store/session-store';
import { TOOL_COLORS } from '../../shared/types';

export default function ExpandedNodeView() {
  const expandNode = useSessionStore(s => s.expandNode);
  const expandedNodeId = useFocusedPane(p => p.expandedNodeId);

  const node = useSessionStore(s => {
    const pane = s.panes[s.focusedPane];
    if (!pane.expandedNodeId) return null;
    return pane.nodes.find(n => n.id === pane.expandedNodeId) ?? null;
  });

  // BFS to collect Claude's reply text for user nodes
  const replyDetail = useSessionStore(s => {
    const pane = s.panes[s.focusedPane];
    if (!pane.expandedNodeId) return null;
    const selected = pane.nodes.find(n => n.id === pane.expandedNodeId);
    if (!selected || selected.kind !== 'user') return null;

    const childMap = new Map<string, string[]>();
    for (const e of pane.edges) {
      const list = childMap.get(e.source);
      if (list) list.push(e.target);
      else childMap.set(e.source, [e.target]);
    }

    const nodeMap = new Map(pane.nodes.map(n => [n.id, n]));
    const textDetails: string[] = [];
    const queue = [pane.expandedNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const n = nodeMap.get(id);
      if (!n) continue;
      if (n.kind === 'user' && id !== pane.expandedNodeId) continue;
      if (n.kind === 'text') textDetails.push(n.detail);
      const children = childMap.get(id);
      if (children) for (const child of children) queue.push(child);
    }

    if (textDetails.length === 0) return null;
    return textDetails.join('\n\n');
  });

  const close = useCallback(() => expandNode(null), [expandNode]);

  // Close on Escape
  useEffect(() => {
    if (!expandedNodeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedNodeId, close]);

  if (!node) return null;

  const color = node.kind === 'tool_use'
    ? (TOOL_COLORS[node.toolName!] || TOOL_COLORS.default)
    : node.kind === 'user' ? '#34d399'
    : node.kind === 'thinking' ? '#a855f7'
    : node.kind === 'compaction' ? '#fbbf24'
    : node.kind === 'session_end' ? '#475569'
    : '#6b7280';

  const typeLabel = node.kind === 'tool_use' ? node.toolName : node.kind;

  const hasTokens = node.inputTokens || node.outputTokens;

  return createPortal(
    <div className="expanded-overlay" onClick={close}>
      <div className="expanded-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="expanded-header" style={{ borderBottomColor: `${color}30` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span style={{
              color,
              fontWeight: 700,
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              flexShrink: 0,
            }}>
              {typeLabel}
            </span>
            {node.status && (
              <span style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                backgroundColor: node.status === 'error' ? '#ff3d7120' : '#34d39920',
                color: node.status === 'error' ? '#ff3d71' : '#34d399',
                flexShrink: 0,
              }}>
                {node.status}
              </span>
            )}
            {hasTokens && (
              <span style={{
                fontSize: 10,
                color: '#64748b',
                fontFamily: 'var(--font-mono, monospace)',
                flexShrink: 0,
              }}>
                {node.inputTokens?.toLocaleString()}↓ {node.outputTokens?.toLocaleString()}↑
              </span>
            )}
            <span style={{
              fontSize: 10,
              color: '#475569',
              marginLeft: 'auto',
              flexShrink: 0,
            }}>
              {node.timestamp}
            </span>
          </div>
          <button onClick={close} className="expanded-close">{'\u2715'}</button>
        </div>

        {/* Body */}
        <div className="expanded-body">
          {/* Label */}
          <div className="expanded-section">
            <div className="expanded-label">Content</div>
            <div style={{
              fontSize: 13,
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.6,
            }}>
              {node.label}
            </div>
          </div>

          {/* Detail */}
          {node.detail && node.detail !== node.label && (
            <div className="expanded-section">
              <div className="expanded-label">Detail</div>
              <pre className="expanded-pre">{node.detail}</pre>
            </div>
          )}

          {/* Replying To (user nodes) */}
          {node.replyToSnippet && (
            <div className="expanded-section">
              <div className="expanded-label">Replying To</div>
              <pre className="expanded-pre" style={{
                borderLeft: '3px solid #a855f7',
                fontStyle: 'italic',
                color: '#94a3b8',
              }}>{node.replyToSnippet}</pre>
            </div>
          )}

          {/* Claude's Reply (user nodes) */}
          {replyDetail && (
            <div className="expanded-section">
              <div className="expanded-label">Claude's Reply</div>
              <pre className="expanded-pre" style={{
                borderLeft: '3px solid #34d399',
              }}>{replyDetail}</pre>
            </div>
          )}

          {/* Question Options (AskUserQuestion nodes) */}
          {node.questionOptions && node.questionOptions.length > 0 && (
            <div className="expanded-section">
              <div className="expanded-label">Options</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {node.questionOptions.map((opt, i) => (
                  <div key={i} style={{
                    fontSize: 12,
                    color: opt.chosen ? '#34d399' : '#94a3b8',
                    padding: '4px 8px',
                    borderRadius: 4,
                    backgroundColor: opt.chosen ? '#34d39910' : 'transparent',
                  }}>
                    {opt.chosen ? '\u2713 ' : '\u2022 '}{opt.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Turn tokens (user nodes) */}
          {(node.turnInputTokens || node.turnOutputTokens) && (
            <div className="expanded-section">
              <div className="expanded-label">Turn Usage</div>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                {node.turnInputTokens?.toLocaleString()} input &middot; {node.turnOutputTokens?.toLocaleString()} output
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
