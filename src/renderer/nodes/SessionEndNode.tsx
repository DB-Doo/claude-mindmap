import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';

function SessionEndNode({ data }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const isCompacted = gn.endReason === 'compacted';
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node session-end-node ${isCompacted ? 'session-end-compacted' : 'session-end-terminated'} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': isCompacted ? '#fbbf24' : '#475569' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{isCompacted ? '\uD83D\uDCE6' : '\u23F9'}</span>
        <span>{gn.label}</span>
      </div>
      <div className="node-label">{gn.detail}</div>
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

export default memo(SessionEndNode);
