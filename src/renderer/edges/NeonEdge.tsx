import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';
import { TOOL_COLORS } from '../../shared/types';

function NeonEdge(props: EdgeProps) {
  const {
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const edgeData = data as Record<string, unknown> | undefined;
  const color = TOOL_COLORS[edgeData?.toolName as string || ''] || TOOL_COLORS.default;
  const totalEdges = (edgeData?.totalEdges as number) || 0;
  const showParticles = totalEdges < 200;

  return (
    <g>
      {/* Glow layer */}
      <path
        d={edgePath}
        className="neon-edge-glow"
        stroke={color}
        fill="none"
      />
      {/* Crisp line */}
      <path
        d={edgePath}
        className="neon-edge-line"
        stroke={color}
        fill="none"
      />
      {/* Particles only for smaller graphs */}
      {showParticles && (
        <>
          <circle r="3" fill={color} className="edge-particle" opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="2" fill={color} className="edge-particle" opacity="0.6">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} begin="1s" />
          </circle>
        </>
      )}
    </g>
  );
}

export default memo(NeonEdge);
