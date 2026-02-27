import { memo, type CSSProperties, type MouseEvent } from 'react';
import type { MiniMapNodeProps } from '@xyflow/react';

const EMERALD = '#34d399';
const PURPLE = '#a855f7';
const GRAY = '#6b7280';
const GOLD = '#fbbf24';
const SLATE = '#475569';

function MiniMapNodeComponent({
  id,
  x,
  y,
  width,
  height,
  color,
  strokeColor,
  strokeWidth: defaultStrokeWidth,
  borderRadius,
  className,
  selected,
  shapeRendering,
  onClick,
}: MiniMapNodeProps) {
  const c = color || GRAY;

  // Determine colors based on node kind (encoded via nodeColor function)
  let fill: string;
  let stroke: string;
  let sw: number;

  if (c === EMERALD) {
    fill = EMERALD;
    stroke = EMERALD;
    sw = 2;
  } else if (c === PURPLE) {
    fill = PURPLE;
    stroke = PURPLE;
    sw = 1;
  } else if (c === GRAY) {
    fill = GRAY;
    stroke = GRAY;
    sw = 1;
  } else if (c === GOLD) {
    fill = GOLD;
    stroke = GOLD;
    sw = 1.5;
  } else if (c === SLATE) {
    fill = SLATE;
    stroke = SLATE;
    sw = 1;
  } else {
    fill = c;
    stroke = c;
    sw = 1.5;
  }

  if (selected) {
    stroke = '#fbbf24';
    sw = 3;
  }

  // Override React Flow's CSS variables on this element so the
  // .react-flow__minimap-node rule resolves to our colors.
  const style: CSSProperties & Record<string, string | number> = {
    '--xy-minimap-node-background-color-props': fill,
    '--xy-minimap-node-stroke-color-props': stroke,
    '--xy-minimap-node-stroke-width-props': sw,
  };

  return (
    <rect
      className={['react-flow__minimap-node', selected && 'selected', className]
        .filter(Boolean)
        .join(' ')}
      x={x}
      y={y}
      rx={borderRadius}
      ry={borderRadius}
      width={width}
      height={height}
      shapeRendering={shapeRendering}
      style={style}
      onClick={onClick ? (event: MouseEvent) => onClick(event, id) : undefined}
    />
  );
}

export default memo(MiniMapNodeComponent);
