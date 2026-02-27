import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import { useSessionStore } from '../store/session-store';

const MAX_LABEL_LENGTH = 120;

function ThinkingNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const liveActivity = useSessionStore((s) => s.liveActivity);
  const nodes = useSessionStore((s) => s.nodes);

  // This node is "active" if Claude is currently thinking and
  // this is the last thinking node in the graph.
  const isActive =
    liveActivity === 'thinking' &&
    nodes.length > 0 &&
    nodes[nodes.length - 1]?.kind === 'thinking' &&
    nodes[nodes.length - 1]?.id === id;

  const truncated =
    gn.label.length > MAX_LABEL_LENGTH
      ? gn.label.slice(0, MAX_LABEL_LENGTH) + '\u2026'
      : gn.label;

  return (
    <motion.div
      initial={gn.isNew ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`mind-map-node thinking-node ${gn.isNew ? 'node-new' : ''} ${isActive ? 'thinking-active' : ''}`}
      style={{ '--pulse-color': isActive ? '#a855f7' : '#64748b' } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{isActive ? '\uD83E\uDDE0' : '\uD83D\uDCAD'}</span>
        <span>{isActive ? 'Thinking...' : 'Thinking'}</span>
        {isActive && <div className="spinner" style={{ display: 'inline-block', borderTopColor: '#a855f7' }} />}
      </div>
      <div className="node-label">{truncated}</div>
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

export default memo(ThinkingNode);
