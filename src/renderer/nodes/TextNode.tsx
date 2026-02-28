import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import CollapseButton from './CollapseButton';
import { formatTokensBadge } from './tokenBadge';

function TextNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode & { isExpanded?: boolean };
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node text-node ${gn.isFirstResponse ? 'text-primary' : ''} ${gn.isLastMessage ? 'text-last-message' : ''} ${gn.isNew ? 'node-new' : ''} ${gn.searchMatch ? 'search-match' : ''} ${gn.isExpanded ? 'node-inline-expanded' : ''}`;
  const style = { '--pulse-color': '#6b7280' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{'\uD83D\uDCAC'}</span>
        <span>Response</span>
        {formatTokensBadge(gn)}
      </div>
      {gn.isExpanded ? (
        <div className="node-expanded-content">{gn.detail || gn.label}</div>
      ) : (
        <div className="node-label">{gn.label}</div>
      )}
      {gn.isLastMessage && !gn.isExpanded && (
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

export default memo(TextNode);
