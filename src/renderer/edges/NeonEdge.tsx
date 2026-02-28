import { memo } from 'react';
import { getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { TOOL_COLORS } from '../../shared/types';

function NeonEdge(props: EdgeProps) {
  const {
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data,
  } = props;

  // Use smooth step for cross-column edges (large horizontal distance),
  // bezier for within-column edges (mostly vertical).
  const isCrossColumn = Math.abs(targetX - sourceX) > 100;

  const [edgePath] = isCrossColumn
    ? getSmoothStepPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
        borderRadius: 16,
      })
    : getBezierPath({
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
            <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} keySplines="0.25 0.46 0.45 0.94" calcMode="spline" keyTimes="0;1" />
          </circle>
          <circle r="2" fill={color} className="edge-particle" opacity="0.5">
            <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} begin="1.2s" keySplines="0.25 0.46 0.45 0.94" calcMode="spline" keyTimes="0;1" />
          </circle>
        </>
      )}
    </g>
  );
}

export default memo(NeonEdge);
