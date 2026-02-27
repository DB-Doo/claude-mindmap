import { useMemo } from 'react';
import dagre from 'dagre';
import { type Node, type Edge } from '@xyflow/react';
import { GraphNode, GraphEdge, LayoutDirection } from '../../shared/types';

const NODE_WIDTH = 280;
const BASE_HEIGHT = 50; // header + padding
const LINE_HEIGHT = 17; // ~12px font * 1.4 line-height
const CHARS_PER_LINE = 36; // rough chars per line at 12px in 280px width
const MAX_LINES = 8; // matches -webkit-line-clamp in CSS

/**
 * Estimate the rendered height of a node based on its label text
 * so dagre can space nodes properly and avoid overlapping.
 */
function estimateNodeHeight(label: string): number {
  const lines = Math.min(Math.ceil(label.length / CHARS_PER_LINE), MAX_LINES);
  return BASE_HEIGHT + lines * LINE_HEIGHT;
}

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
    case 'compaction':
      return 'compactionNode';
    case 'session_end':
      return 'sessionEndNode';
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
      const h = estimateNodeHeight(node.label);
      g.setNode(node.id, { width: NODE_WIDTH, height: h });
    });

    graphEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const nodes = graphNodes.map((gn) => {
      const pos = g.node(gn.id);
      const h = estimateNodeHeight(gn.label);
      return {
        id: gn.id,
        type: nodeTypeFromKind(gn.kind),
        position: {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - h / 2,
        },
        data: gn as unknown as Record<string, unknown>,
      };
    }) satisfies Node[];

    // Build lookup map for O(1) node access instead of O(n) find per edge
    const nodeById = new Map(graphNodes.map((n) => [n.id, n]));
    const totalEdges = graphEdges.length;

    const edges: Edge[] = graphEdges.map((ge) => ({
      id: ge.id,
      source: ge.source,
      target: ge.target,
      type: 'neonEdge',
      data: {
        toolName: nodeById.get(ge.target)?.toolName,
        totalEdges,
      },
    }));

    return { nodes, edges };
  }, [graphNodes, graphEdges, direction]);
}
