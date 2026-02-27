import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import CollapseButton from './CollapseButton';

function UserNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node user-node ${gn.isNew ? 'node-new neon-pulse' : ''} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': '#34d399' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\u25B6'}</span>
        <span>You</span>
      </div>
      <div className="node-label">{gn.label}</div>
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

export default memo(UserNode);
