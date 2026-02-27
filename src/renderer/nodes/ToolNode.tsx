import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { GraphNode, TOOL_COLORS } from '../../shared/types';
import CollapseButton from './CollapseButton';
import { formatTokensBadge } from './tokenBadge';

const TOOL_ICONS: Record<string, string> = {
  Bash: '\u26A1', Read: '\uD83D\uDCD6', Edit: '\u270F\uFE0F', Write: '\uD83D\uDCDD',
  Grep: '\uD83D\uDD0D', Glob: '\uD83D\uDCC2', WebFetch: '\uD83C\uDF10', WebSearch: '\uD83D\uDD0E',
  Task: '\uD83D\uDE80', Skill: '\u2B50', AskUserQuestion: '\u2753',
};

function ToolNode({ data, id }: NodeProps) {
  const gn = data as unknown as GraphNode;
  const color = TOOL_COLORS[gn.toolName || ''] || TOOL_COLORS.default;
  const icon = TOOL_ICONS[gn.toolName || ''] || '\uD83D\uDD27';
  const toolClass = `tool-${(gn.toolName || 'default').toLowerCase()}`;
  const dimmed = gn.searchMatch === false && gn.searchMatch !== undefined;
  const needsAnimation = gn.isNew || dimmed;

  const className = `mind-map-node ${toolClass} ${gn.isNew ? 'node-new' : ''} ${gn.status === 'running' ? 'node-running' : ''} ${gn.searchMatch ? 'search-match' : ''}`;
  const style = { '--pulse-color': color } as React.CSSProperties;

  const isQuestion = gn.toolName === 'AskUserQuestion' && gn.questionOptions;

  const content = (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="node-header">
        <span className="node-icon">{icon}</span>
        <span>{isQuestion ? 'Question' : gn.toolName}</span>
        {gn.status === 'running' && <div className="spinner" />}
        {!isQuestion && gn.status && (
          <span className={`node-status ${gn.status}`}>
            {gn.status}
          </span>
        )}
        {formatTokensBadge(gn)}
      </div>
      <div className="node-label">{gn.label}</div>
      {isQuestion && gn.questionOptions && (
        <div className="question-options">
          {gn.questionOptions.map((opt, idx) => (
            <div
              key={idx}
              className={`question-option ${opt.chosen ? 'question-option-chosen' : ''}`}
            >
              <span className="question-option-marker">{opt.chosen ? '\u2713' : '\u25CB'}</span>
              <span>{opt.label}</span>
            </div>
          ))}
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

export default memo(ToolNode);
