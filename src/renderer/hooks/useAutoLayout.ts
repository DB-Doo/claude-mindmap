import { useMemo } from 'react';
import dagre from 'dagre';
import { type Node, type Edge } from '@xyflow/react';
import { GraphNode, GraphEdge, LayoutDirection } from '../../shared/types';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;

/**
 * Maps a GraphNode kind to the corresponding React Flow custom node type.
 */
function nodeTypeFromKind(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'tool_use':
      return 'toolNode';
    case 'user':
      return 'userNode';
    case 'thinking':
      return 'thinkingNode';
    case 'text':
      return 'textNode';
    default:
      return 'systemNode';
  }
}

/**
 * Uses dagre to compute an automatic hierarchical layout for the mind-map
 * graph, converting internal GraphNode/GraphEdge arrays into positioned
 * React Flow Node/Edge arrays.
 *
 * The layout is recomputed whenever the input nodes, edges, or direction
 * change (memoised via useMemo).
 */
export function useAutoLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  direction: LayoutDirection,
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (graphNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: direction,
      nodesep: 60,
      ranksep: 80,
      marginx: 40,
      marginy: 40,
    });

    graphNodes.forEach((node) => {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    graphEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const nodes = graphNodes.map((gn) => {
      const pos = g.node(gn.id);
      return {
        id: gn.id,
        type: nodeTypeFromKind(gn.kind),
        position: {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
        },
        data: gn as unknown as Record<string, unknown>,
      };
    }) satisfies Node[];

    const edges: Edge[] = graphEdges.map((ge) => ({
      id: ge.id,
      source: ge.source,
      target: ge.target,
      type: 'neonEdge',
      data: {
        toolName: graphNodes.find((n) => n.id === ge.target)?.toolName,
      },
    }));

    return { nodes, edges };
  }, [graphNodes, graphEdges, direction]);
}
