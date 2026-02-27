import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { GraphNode, TOOL_COLORS } from '../../shared/types';

const TOOL_ICONS: Record<string, string> = {
  Bash: '\u26A1', Read: '\uD83D\uDCD6', Edit: '\u270F\uFE0F', Write: '\uD83D\uDCDD',
  Grep: '\uD83D\uDD0D', Glob: '\uD83D\uDCC2', WebFetch: '\uD83C\uDF10', WebSearch: '\uD83D\uDD0E',
  Task: '\uD83D\uDE80', Skill: '\u2B50',
};

function ToolNode({ data }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const color = TOOL_COLORS[gn.toolName || ''] || TOOL_COLORS.default;
  const icon = TOOL_ICONS[gn.toolName || ''] || '\uD83D\uDD27';
  const toolClass = `tool-${(gn.toolName || 'default').toLowerCase()}`;

  return (
    <motion.div
      initial={gn.isNew ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`mind-map-node ${toolClass} ${gn.isNew ? 'node-new' : ''} ${gn.status === 'running' ? 'node-running' : ''}`}
      style={{ '--pulse-color': color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{icon}</span>
        <span>{gn.toolName}</span>
        {gn.status === 'running' && <div className="spinner" />}
        {gn.status && (
          <span className={`node-status ${gn.status}`}>
            {gn.status}
          </span>
        )}
      </div>
      <div className="node-label">{gn.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </motion.div>
  );
}

export default memo(ToolNode);
