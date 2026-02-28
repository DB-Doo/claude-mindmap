import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import { useSessionStore } from '../store/session-store';
import CollapseButton from './CollapseButton';
import ExpandNavButtons from './ExpandNavButtons';
import { formatTokensBadge } from './tokenBadge';

const MAX_LABEL_LENGTH = 120;

function ThinkingNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode & { isExpanded?: boolean };

  // Derived boolean selector — only re-renders when the result changes
  const isActive = useSessionStore((s) => {
    if (s.liveActivity !== 'thinking' || s.nodes.length === 0) return false;
    const last = s.nodes[s.nodes.length - 1];
    return last?.kind === 'thinking' && last?.id === id;
  });

  const truncated =
    gn.label.length > MAX_LABEL_LENGTH
      ? gn.label.slice(0, MAX_LABEL_LENGTH) + '\u2026'
      : gn.label;

  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node thinking-node ${gn.isNew ? 'node-new' : ''} ${isActive ? 'thinking-active' : ''} ${gn.searchMatch ? 'search-match' : ''} ${gn.isExpanded ? 'node-inline-expanded' : ''}`;
  const style = { '--pulse-color': isActive ? '#a855f7' : '#64748b' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{isActive ? '\uD83E\uDDE0' : '\uD83D\uDCAD'}</span>
        <span>{isActive ? 'Thinking...' : 'Thinking'}</span>
        {isActive && <div className="spinner" style={{ display: 'inline-block', borderTopColor: '#a855f7' }} />}
        {formatTokensBadge(gn)}
      </div>
      {gn.isExpanded ? (
        <div className="node-expanded-content">{gn.detail || gn.label}</div>
      ) : (
        <div className="node-label">{truncated}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
      <CollapseButton nodeId={id} childCount={gn.childCount || 0} collapsed={gn.collapsed || false} />
      {gn.isExpanded && <ExpandNavButtons />}
    </>
  );

  if (needsAnimation) {
    return (
      <motion.div
        initial={gn.isNew ? { scale: 0.85, opacity: 0, y: 15 } : false}
        animate={{ scale: 1, opacity: dimmed ? 0.3 : 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.8 }}
        className={className}
        style={style}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export default memo(ThinkingNode);
