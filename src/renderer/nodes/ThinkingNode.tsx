import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import { useSessionStore } from '../store/session-store';
import CollapseButton from './CollapseButton';

const MAX_LABEL_LENGTH = 120;

function ThinkingNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode;

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

  const className = `mind-map-node thinking-node ${gn.isNew ? 'node-new' : ''} ${isActive ? 'thinking-active' : ''} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': isActive ? '#a855f7' : '#64748b' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{isActive ? '\uD83E\uDDE0' : '\uD83D\uDCAD'}</span>
        <span>{isActive ? 'Thinking...' : 'Thinking'}</span>
        {isActive && <div className="spinner" style={{ display: 'inline-block', borderTopColor: '#a855f7' }} />}
      </div>
      <div className="node-label">{truncated}</div>
      <Handle type="source" position={Position.Bottom} />
      <CollapseButton nodeId={id} childCount={gn.childCount || 0} collapsed={gn.collapsed || false} />
    </>
  );

  if (needsAnimation) {
    return (
      <motion.div
        initial={gn.isNew ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: 1, opacity: dimmed ? 0.3 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
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
