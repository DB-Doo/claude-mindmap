import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';

function UserNode({ data }: NodeProps) {
  const gn = data as unknown as GraphNode;

  return (
    <motion.div
      initial={gn.isNew ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`mind-map-node user-node ${gn.isNew ? 'node-new neon-pulse' : ''}`}
      style={{ '--pulse-color': '#34d399' } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\uD83D\uDC64'}</span>
        <span>You</span>
      </div>
      <div className="node-label">{gn.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

export default memo(UserNode);
