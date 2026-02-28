import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';

function QueueNode({ data }: NodeProps) {
  const gn = data as unknown as GraphNode;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 15 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, mass: 0.8 }}
      className="mind-map-node queue-node"
      style={{ '--pulse-color': '#fbbf24' } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\u231B'}</span>
        <span>Queued</span>
      </div>
      <div className="node-label">{gn.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

export default memo(QueueNode);
