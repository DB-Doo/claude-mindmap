import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import type { GraphNode } from '../../shared/types';
import CollapseButton from './CollapseButton';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function UserNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode & { isExpanded?: boolean };
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node user-node ${gn.isNew ? 'node-new neon-pulse' : ''} ${gn.searchMatch ? 'search-match' : ''} ${gn.isExpanded ? 'node-inline-expanded' : ''}`;
  const style = { '--pulse-color': '#34d399' } as React.CSSProperties;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      {gn.replyToSnippet && (
        <div className="reply-to-snippet">
          <span className="reply-to-icon">{'\u21A9'}</span>
          <span className="reply-to-text">{gn.replyToSnippet}</span>
        </div>
      )}
      <div className="node-header">
        <span className="node-icon">{'\u25B6'}</span>
        <span>You</span>
        {(gn.turnInputTokens || gn.turnOutputTokens) ? (
          <span className="node-tokens">
            {formatTokens((gn.turnInputTokens || 0) + (gn.turnOutputTokens || 0))} tok
          </span>
        ) : null}
      </div>
      {gn.isExpanded ? (
        <div className="node-expanded-content">{gn.detail || gn.label}</div>
      ) : (
        <div className="node-label">{gn.label}</div>
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

export default memo(UserNode);
