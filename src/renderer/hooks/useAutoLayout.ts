import { useMemo, useRef } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import { GraphNode, GraphEdge } from '../../shared/types';

const NODE_WIDTH = 340; // matches CSS max-width on .mind-map-node
const BASE_HEIGHT = 50;
const LINE_HEIGHT = 17;
const CHARS_PER_LINE = 36;
const MAX_LINES = 8;
const COL_GAP = 120;  // horizontal gap between columns
const ROW_GAP = 35;   // vertical gap between nodes in a column
const TOP_MARGIN = 40;

const EXPANDED_CHARS_PER_LINE = 34; // conservative — accounts for code indentation
const EXPANDED_LINE_HEIGHT = 19;    // 12px * 1.6 line-height
const EXPANDED_MAX_CONTENT = 500;   // matches CSS max-height on .node-expanded-content
const EXPANDED_OVERHEAD = 100;      // header + padding + nav buttons

function estimateNodeHeight(node: GraphNode, isExpanded = false): number {
  if (isExpanded) {
    const text = node.detail || node.label;
    let lines = 0;
    for (const seg of text.split('\n')) {
      // Each newline is at least one line; long segments wrap
      lines += Math.max(1, Math.ceil(seg.length / EXPANDED_CHARS_PER_LINE));
    }
    const contentHeight = Math.min(lines * EXPANDED_LINE_HEIGHT, EXPANDED_MAX_CONTENT);
    return EXPANDED_OVERHEAD + contentHeight;
  }

  // Last-message nodes show up to 16 lines in a wider box
  const maxLines = node.isLastMessage ? 16 : MAX_LINES;
  const charsPerLine = node.isLastMessage ? 44 : CHARS_PER_LINE; // wider node
  // Count actual rendered lines: each \n creates a line break (pre-wrap),
  // plus long lines wrap. Take the larger of char-based vs newline-based estimate.
  const charBasedLines = Math.ceil(node.label.length / charsPerLine);
  let actualLines = charBasedLines;
  if (node.label.includes('\n')) {
    const segments = node.label.split('\n');
    actualLines = 0;
    for (const seg of segments) {
      actualLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
    }
  }
  const lines = Math.min(Math.max(charBasedLines, actualLines), maxLines);
  let height = BASE_HEIGHT + lines * LINE_HEIGHT;
  // User nodes have extra content: reply-to snippet + token tally
  if (node.kind === 'user') {
    if (node.replyToSnippet) height += 24;
    if (node.turnInputTokens || node.turnOutputTokens) height += 4;
  }
  // First-response text nodes have larger text
  if (node.isFirstResponse) height += 12;
  // Last-message nodes have a "Waiting for you" badge
  if (node.isLastMessage) height += 32;
  return height;
}

function nodeTypeFromKind(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'tool_use': return 'toolNode';
    case 'user': return 'userNode';
    case 'thinking': return 'thinkingNode';
    case 'text': return 'textNode';
    case 'compaction': return 'compactionNode';
    case 'session_end': return 'sessionEndNode';
    default: return 'systemNode';
  }
}

// ---------------------------------------------------------------------------
// Conversation layout: user messages horizontal, responses vertical below
// ---------------------------------------------------------------------------

function conversationLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  expandedNodeId?: string | null,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (graphNodes.length === 0) return positions;

  // Build adjacency
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of graphEdges) {
    const list = childrenOf.get(e.source);
    if (list) list.push(e.target);
    else childrenOf.set(e.source, [e.target]);
    hasParent.add(e.target);
  }

  // Node lookup
  const nodeMap = new Map<string, GraphNode>();
  for (const n of graphNodes) nodeMap.set(n.id, n);

  // Find roots
  const roots: string[] = [];
  for (const n of graphNodes) {
    if (!hasParent.has(n.id)) roots.push(n.id);
  }

  // DFS to collect nodes in chain order
  const ordered: GraphNode[] = [];
  const visited = new Set<string>();
  function dfs(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const gn = nodeMap.get(id);
    if (gn) ordered.push(gn);
    const kids = childrenOf.get(id) || [];
    for (const kid of kids) dfs(kid);
  }
  for (const rootId of roots) dfs(rootId);
  // Orphans
  for (const n of graphNodes) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      ordered.push(n);
    }
  }

  // Split into columns: each column starts at a user node
  const columns: GraphNode[][] = [];
  let currentCol: GraphNode[] = [];
  for (const node of ordered) {
    if (node.kind === 'user' && currentCol.length > 0) {
      columns.push(currentCol);
      currentCol = [node];
    } else {
      currentCol.push(node);
    }
  }
  if (currentCol.length > 0) columns.push(currentCol);

  // Position: columns left-to-right, nodes stacked vertically within each
  let x = 0;
  for (const column of columns) {
    let y = TOP_MARGIN;
    for (const node of column) {
      positions.set(node.id, { x, y });
      y += estimateNodeHeight(node, node.id === expandedNodeId) + ROW_GAP;
    }
    x += NODE_WIDTH + COL_GAP;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

interface CachedPosition { x: number; y: number }

export function useAutoLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  filterRevision: number = 0,
  expandedNodeId?: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const posCache = useRef<Map<string, CachedPosition>>(new Map());

  return useMemo(() => {
    if (graphNodes.length === 0) {
      posCache.current.clear();
      return { nodes: [], edges: [] };
    }

    const cache = posCache.current;

    // Count new nodes not in cache and check if any cached nodes were removed
    let newCount = 0;
    let newNodesScattered = false; // true if new nodes are interspersed with cached ones
    let sawNewNode = false;
    for (const n of graphNodes) {
      if (!cache.has(n.id)) {
        newCount++;
        sawNewNode = true;
      } else if (sawNewNode) {
        // A cached node appears after a new node — new nodes are not just at the tail.
        // This means a filter toggle re-added nodes, not streaming new messages.
        newNodesScattered = true;
      }
    }
    const currentIds = new Set(graphNodes.map(n => n.id));
    let removedCount = 0;
    for (const key of cache.keys()) {
      if (!currentIds.has(key)) removedCount++;
    }
    // Full relayout when: nodes removed, new nodes scattered (filter toggle), or too many new nodes
    const isIncremental = removedCount === 0 && !newNodesScattered && newCount > 0 && newCount < Math.max(graphNodes.length * 0.3, 20);

    if (!isIncremental) {
      // Full conversation layout
      const positions = conversationLayout(graphNodes, graphEdges, expandedNodeId);
      cache.clear();
      for (const [id, pos] of positions) {
        cache.set(id, pos);
      }
    } else {
      // Incremental: find the last column's x and append new nodes there
      // or start a new column if a new user message arrived
      const nodeMap = new Map<string, GraphNode>();
      for (const n of graphNodes) nodeMap.set(n.id, n);

      const parentOf = new Map<string, string>();
      for (const e of graphEdges) parentOf.set(e.target, e.source);

      // Find the rightmost x and the max y at that x (last column)
      let maxX = 0;
      let maxYAtMaxX = 0;
      for (const pos of cache.values()) {
        if (pos.x > maxX) {
          maxX = pos.x;
          maxYAtMaxX = pos.y;
        } else if (pos.x === maxX && pos.y > maxYAtMaxX) {
          maxYAtMaxX = pos.y;
        }
      }

      // Find height of the node at the bottom of the last column
      let bottomHeight = BASE_HEIGHT;
      for (const [id, pos] of cache.entries()) {
        if (pos.x === maxX && pos.y === maxYAtMaxX) {
          const gn = nodeMap.get(id);
          if (gn) bottomHeight = estimateNodeHeight(gn);
          break;
        }
      }

      let currentX = maxX;
      let currentY = maxYAtMaxX + bottomHeight + ROW_GAP;

      for (const gn of graphNodes) {
        if (cache.has(gn.id)) continue;
        if (gn.kind === 'user') {
          // Start a new column
          currentX = maxX + NODE_WIDTH + COL_GAP;
          maxX = currentX;
          currentY = TOP_MARGIN;
        }
        cache.set(gn.id, { x: currentX, y: currentY });
        currentY += estimateNodeHeight(gn, gn.id === expandedNodeId) + ROW_GAP;
      }
    }

    // Prune stale cache entries
    if (cache.size > graphNodes.length + 50) {
      const valid = new Set(graphNodes.map(n => n.id));
      for (const key of cache.keys()) {
        if (!valid.has(key)) cache.delete(key);
      }
    }

    // Build React Flow nodes
    const nodes = graphNodes.map((gn) => {
      const pos = cache.get(gn.id) || { x: 0, y: 0 };
      const expanded = gn.id === expandedNodeId;
      return {
        id: gn.id,
        type: nodeTypeFromKind(gn.kind),
        position: { x: pos.x, y: pos.y },
        width: gn.isLastMessage ? 420 : NODE_WIDTH,
        height: estimateNodeHeight(gn, expanded),
        data: gn as unknown as Record<string, unknown>,
      };
    }) satisfies Node[];

    // Build edges — include filterRevision in IDs so ReactFlow treats
    // edges as new after filter toggles (works around stale edge rendering).
    const nodeById = new Map(graphNodes.map((n) => [n.id, n]));
    const totalEdges = graphEdges.length;
    const revSuffix = filterRevision > 0 ? `#${filterRevision}` : '';
    const edges: Edge[] = graphEdges.map((ge) => ({
      id: ge.id + revSuffix,
      source: ge.source,
      target: ge.target,
      type: 'neonEdge',
      data: {
        toolName: nodeById.get(ge.target)?.toolName,
        totalEdges,
      },
    }));

    return { nodes, edges };
  }, [graphNodes, graphEdges, filterRevision, expandedNodeId]);
}
