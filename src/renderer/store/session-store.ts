import { create } from 'zustand';
import {
  SessionInfo,
  JSONLMessage,
  GraphNode,
  GraphEdge,
  LayoutDirection,
} from '../../shared/types';
import { buildGraph } from './graph-builder';

export type LiveActivity = 'idle' | 'thinking' | 'tool_running' | 'responding' | 'waiting_on_user';

interface SessionState {
  // Session management
  sessions: SessionInfo[];
  activeSessionPath: string | null;

  // Graph data
  rawMessages: JSONLMessage[];
  nodes: GraphNode[];
  edges: GraphEdge[];

  // UI state
  selectedNodeId: string | null;
  layoutDirection: LayoutDirection;
  showThinking: boolean;
  showText: boolean;
  showSystem: boolean;
  autoFollow: boolean;
  newNodeIds: Set<string>;
  liveActivity: LiveActivity;
  lastActivityTime: number;

  // Actions
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (path: string) => void;
  setMessages: (messages: JSONLMessage[]) => void;
  appendMessages: (messages: JSONLMessage[]) => void;
  selectNode: (id: string | null) => void;
  setLayoutDirection: (dir: LayoutDirection) => void;
  toggleShowThinking: () => void;
  toggleShowText: () => void;
  toggleShowSystem: () => void;
  toggleAutoFollow: () => void;
  clearNewNodes: () => void;
  setIdle: () => void;
}

/**
 * Filter nodes and edges based on the current visibility toggles.
 * Removes nodes whose kind is toggled off, and any edges that
 * reference a removed node.
 */
function applyFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  showThinking: boolean,
  showText: boolean,
  showSystem: boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const filteredNodes = nodes.filter((node) => {
    if (!showThinking && node.kind === 'thinking') return false;
    if (!showText && node.kind === 'text') return false;
    if (!showSystem && node.kind === 'system') return false;
    return true;
  });

  const validIds = new Set(filteredNodes.map((n) => n.id));

  const filteredEdges = edges.filter(
    (edge) => validIds.has(edge.source) && validIds.has(edge.target),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

/**
 * Detect what Claude is currently doing based on the tail of the message stream.
 * Walk backwards from the end to find the last meaningful message type.
 */
function detectActivity(messages: JSONLMessage[]): LiveActivity {
  let sawSystem = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Progress messages mean something is actively happening
    if (msg.type === 'progress') continue;

    // System messages (turn duration) appear after Claude finishes a turn.
    // If we see one before any assistant/user message, Claude's turn is done.
    if (msg.type === 'system') {
      sawSystem = true;
      continue;
    }

    if (msg.type === 'assistant') {
      const content = (msg as any).message?.content;
      if (!Array.isArray(content) || content.length === 0) continue;
      const last = content[content.length - 1];

      // If a system message followed this assistant message, the turn is
      // complete — Claude finished and is now waiting on the user.
      if (sawSystem) {
        if (last.type === 'text') return 'waiting_on_user';
        // After a tool_use + system = tool finished, Claude is processing result
        return 'idle';
      }

      if (last.type === 'thinking') return 'thinking';
      if (last.type === 'tool_use') return 'tool_running';
      if (last.type === 'text') return 'responding';
      return 'idle';
    }

    // A user message (whether string prompt or tool_result) means
    // Claude hasn't started replying yet — still idle from our POV
    if (msg.type === 'user') return 'idle';

    break;
  }
  return 'idle';
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Session management
  sessions: [],
  activeSessionPath: null,

  // Graph data
  rawMessages: [],
  nodes: [],
  edges: [],

  // UI state
  selectedNodeId: null,
  layoutDirection: 'TB',
  showThinking: true,
  showText: true,
  showSystem: true,
  autoFollow: true,
  newNodeIds: new Set<string>(),
  liveActivity: 'idle' as LiveActivity,
  lastActivityTime: 0,

  // ── Actions ──────────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (path) =>
    set({
      activeSessionPath: path,
      selectedNodeId: null,
      newNodeIds: new Set<string>(),
    }),

  setMessages: (messages) => {
    const { showThinking, showText, showSystem } = get();
    const { nodes: allNodes, edges: allEdges } = buildGraph(messages);
    const { nodes, edges } = applyFilters(
      allNodes,
      allEdges,
      showThinking,
      showText,
      showSystem,
    );

    const activity = detectActivity(messages);

    set({
      rawMessages: messages,
      nodes,
      edges,
      newNodeIds: new Set<string>(),
      liveActivity: activity,
      lastActivityTime: Date.now(),
    });
  },

  appendMessages: (messages) => {
    const state = get();
    const combined = [...state.rawMessages, ...messages];

    const previousIds = new Set(state.nodes.map((n) => n.id));
    const { nodes: allNodes, edges: allEdges } = buildGraph(combined);
    const { nodes: filteredNodes, edges: filteredEdges } = applyFilters(
      allNodes,
      allEdges,
      state.showThinking,
      state.showText,
      state.showSystem,
    );

    // Compute new node IDs: present in the fresh build but absent before
    const newIds = new Set<string>();
    for (const node of filteredNodes) {
      if (!previousIds.has(node.id)) {
        newIds.add(node.id);
      }
    }

    // Mark nodes that just appeared with isNew = true
    const nodesWithFlags = filteredNodes.map((node) => ({
      ...node,
      isNew: newIds.has(node.id),
    }));

    const activity = detectActivity(combined);

    set({
      rawMessages: combined,
      nodes: nodesWithFlags,
      edges: filteredEdges,
      newNodeIds: newIds,
      liveActivity: activity,
      lastActivityTime: Date.now(),
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),

  toggleShowThinking: () => {
    const state = get();
    const next = !state.showThinking;
    const { nodes: allNodes, edges: allEdges } = buildGraph(state.rawMessages);
    const { nodes, edges } = applyFilters(
      allNodes,
      allEdges,
      next,
      state.showText,
      state.showSystem,
    );
    set({ showThinking: next, nodes, edges });
  },

  toggleShowText: () => {
    const state = get();
    const next = !state.showText;
    const { nodes: allNodes, edges: allEdges } = buildGraph(state.rawMessages);
    const { nodes, edges } = applyFilters(
      allNodes,
      allEdges,
      state.showThinking,
      next,
      state.showSystem,
    );
    set({ showText: next, nodes, edges });
  },

  toggleShowSystem: () => {
    const state = get();
    const next = !state.showSystem;
    const { nodes: allNodes, edges: allEdges } = buildGraph(state.rawMessages);
    const { nodes, edges } = applyFilters(
      allNodes,
      allEdges,
      state.showThinking,
      state.showText,
      next,
    );
    set({ showSystem: next, nodes, edges });
  },

  toggleAutoFollow: () => set((s) => ({ autoFollow: !s.autoFollow })),

  clearNewNodes: () => {
    const state = get();
    const clearedNodes = state.nodes.map((node) => ({
      ...node,
      isNew: false,
    }));
    set({ nodes: clearedNodes, newNodeIds: new Set<string>() });
  },

  setIdle: () => set({ liveActivity: 'idle' as LiveActivity }),
}));
