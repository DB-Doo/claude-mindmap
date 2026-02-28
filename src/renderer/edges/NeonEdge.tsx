import { memo, useMemo } from 'react';
import { getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { TOOL_COLORS } from '../../shared/types';

/** Target speed in pixels per second — consistent across all edge lengths */
const PARTICLE_SPEED = 120;
const MIN_DUR = 0.8;
const MAX_DUR = 8;

function measurePathLength(d: string): number {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const len = path.getTotalLength();
    document.body.removeChild(svg);
    return len;
  } catch {
    // Fallback: straight-line distance
    return 200;
  }
}

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

  // Calculate duration based on path length for consistent speed
  const dur = useMemo(() => {
    const len = measurePathLength(edgePath);
    const d = len / PARTICLE_SPEED;
    return Math.max(MIN_DUR, Math.min(MAX_DUR, d));
  }, [edgePath]);

  const dur1 = `${dur.toFixed(2)}s`;
  const dur2 = `${(dur * 1.2).toFixed(2)}s`;
  const begin2 = `${(dur * 0.45).toFixed(2)}s`;

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
            <animateMotion dur={dur1} repeatCount="indefinite" path={edgePath} keySplines="0.25 0.46 0.45 0.94" calcMode="spline" keyTimes="0;1" />
          </circle>
          <circle r="2" fill={color} className="edge-particle" opacity="0.5">
            <animateMotion dur={dur2} repeatCount="indefinite" path={edgePath} begin={begin2} keySplines="0.25 0.46 0.45 0.94" calcMode="spline" keyTimes="0;1" />
          </circle>
        </>
      )}
    </g>
  );
}

export default memo(NeonEdge);
