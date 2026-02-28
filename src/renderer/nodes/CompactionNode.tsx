import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';

function CompactionNode({ data }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node compaction-node ${gn.isNew ? 'node-new' : ''} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': '#fbbf24' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\uD83D\uDDDC'}</span>
        <span>Conversation Compacted</span>
      </div>
      <div className="node-label">{gn.label}</div>
      <Handle type="source" position={Position.Bottom} />
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

export default memo(CompactionNode);
