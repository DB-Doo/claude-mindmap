import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import CollapseButton from './CollapseButton';
import { formatTokensBadge } from './tokenBadge';

function TextNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node text-node ${gn.isFirstResponse ? 'text-primary' : ''} ${gn.isLastMessage ? 'text-last-message' : ''} ${gn.isNew ? 'node-new' : ''} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': '#6b7280' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\uD83D\uDCAC'}</span>
        <span>Response</span>
        {formatTokensBadge(gn)}
      </div>
      <div className="node-label">{gn.label}</div>
      {gn.isLastMessage && (
        <div className="waiting-badge">
          <span className="waiting-dot" />
          <span>{'\u23F3'} Waiting for you</span>
        </div>
      )}
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

export default memo(TextNode);
