import { create } from 'zustand';
import {
  SessionInfo,
  JSONLMessage,
  GraphNode,
  GraphEdge,
  LayoutDirection,
  SessionEndReason,
} from '../../shared/types';
import { buildGraph } from './graph-builder';

export type LiveActivity = 'idle' | 'thinking' | 'tool_running' | 'responding' | 'waiting_on_user';

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  estimatedCost: number;
}

interface SessionState {
  // Session management
  sessions: SessionInfo[];
  activeSessionPath: string | null;

  // Graph data
  rawMessages: JSONLMessage[];
  nodes: GraphNode[];
  edges: GraphEdge[];

  // Cached unfiltered graph (output of buildGraph, before filters)
  _cachedAllNodes: GraphNode[];
  _cachedAllEdges: GraphEdge[];

  // Per-session message cache (survives session switches)
  _sessionCache: Map<string, JSONLMessage[]>;

  // UI state
  selectedNodeId: string | null;
  layoutDirection: LayoutDirection;
  showThinking: boolean;
  showText: boolean;
  showSystem: boolean;
  autoFollow: boolean;
  centerRequested: boolean;
  hasNewNodesSinceManualPan: boolean;
  newNodeIds: Set<string>;
  liveActivity: LiveActivity;
  lastActivityTime: number;
  collapsedNodes: Set<string>;
  searchQuery: string;
  tokenStats: TokenStats;

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
  requestCenter: () => void;
  clearCenterRequest: () => void;
  clearNewNodes: () => void;
  setIdle: () => void;
  toggleCollapse: (nodeId: string) => void;
  setSearchQuery: (query: string) => void;
}

// ---------------------------------------------------------------------------
// Token cost estimation (USD per million tokens, Sonnet 4 pricing as default)
// ---------------------------------------------------------------------------
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-haiku-4-20250506': { input: 0.8, output: 4 },
};
const DEFAULT_PRICING = { input: 3, output: 15 };

function computeTokenStats(messages: JSONLMessage[]): TokenStats {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let estimatedCost = 0;

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue;
    const usage = (msg as any).message?.usage;
    if (!usage) continue;

    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cRead = usage.cache_read_input_tokens || 0;
    const cCreate = usage.cache_creation_input_tokens || 0;

    inputTokens += inTok;
    outputTokens += outTok;
    cacheRead += cRead;
    cacheCreation += cCreate;

    const model = (msg as any).message?.model || '';
    const price = PRICING[model] || DEFAULT_PRICING;
    estimatedCost += (inTok * price.input + outTok * price.output) / 1_000_000;
  }

  return { inputTokens, outputTokens, cacheRead, cacheCreation, estimatedCost };
}

// ---------------------------------------------------------------------------
// Descendant counting — single-pass memoized computation
// ---------------------------------------------------------------------------

function buildChildrenMap(edges: GraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.source);
    if (list) list.push(e.target);
    else map.set(e.source, [e.target]);
  }
  return map;
}

/** Compute descendant counts for ALL nodes in a single bottom-up pass. O(n). */
function computeAllDescendantCounts(children: Map<string, string[]>): Map<string, number> {
  const cache = new Map<string, number>();

  function count(nodeId: string): number {
    const cached = cache.get(nodeId);
    if (cached !== undefined) return cached;
    const kids = children.get(nodeId);
    if (!kids || kids.length === 0) {
      cache.set(nodeId, 0);
      return 0;
    }
    let total = kids.length;
    for (const kid of kids) {
      total += count(kid);
    }
    cache.set(nodeId, total);
    return total;
  }

  for (const nodeId of children.keys()) {
    count(nodeId);
  }
  return cache;
}

function getDescendantIds(nodeId: string, children: Map<string, string[]>): Set<string> {
  const result = new Set<string>();
  const stack = children.get(nodeId) ? [...children.get(nodeId)!] : [];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.add(id);
    const kids = children.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Filter pipeline: visibility toggles → collapse → search decoration
// ---------------------------------------------------------------------------

function applyFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  showThinking: boolean,
  showText: boolean,
  showSystem: boolean,
  collapsedNodes: Set<string>,
  searchQuery: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // 1. Visibility filter (compaction + session_end always pass through)
  let filtered = nodes.filter((node) => {
    if (!showThinking && node.kind === 'thinking') return false;
    if (!showText && node.kind === 'text') return false;
    if (!showSystem && node.kind === 'system') return false;
    return true;
  });

  let validIds = new Set(filtered.map((n) => n.id));
  let filteredEdges = edges.filter(
    (e) => validIds.has(e.source) && validIds.has(e.target),
  );

  // 2. Collapse: hide descendants of collapsed nodes
  const children = buildChildrenMap(filteredEdges);
  const descendantCounts = computeAllDescendantCounts(children);

  if (collapsedNodes.size > 0) {
    const hiddenIds = new Set<string>();
    for (const collapsedId of collapsedNodes) {
      if (!validIds.has(collapsedId)) continue;
      for (const descendant of getDescendantIds(collapsedId, children)) {
        hiddenIds.add(descendant);
      }
    }

    // Annotate nodes with childCount and collapsed flag before filtering
    filtered = filtered.map((node) => ({
      ...node,
      childCount: descendantCounts.get(node.id) ?? 0,
      collapsed: collapsedNodes.has(node.id),
    }));

    // Remove hidden descendants
    filtered = filtered.filter((n) => !hiddenIds.has(n.id));
    validIds = new Set(filtered.map((n) => n.id));
    filteredEdges = filteredEdges.filter(
      (e) => validIds.has(e.source) && validIds.has(e.target),
    );
  } else {
    filtered = filtered.map((node) => ({
      ...node,
      childCount: descendantCounts.get(node.id) ?? 0,
      collapsed: false,
    }));
  }

  // 3. Search: mark matching nodes (only when there's an active query)
  if (searchQuery.length > 0) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.map((node) => ({
      ...node,
      searchMatch: (node._searchText || '').includes(q),
    }));
  }

  return { nodes: filtered, edges: filteredEdges };
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

// ---------------------------------------------------------------------------
// Message windowing — only show the last N user turns for active sessions
// ---------------------------------------------------------------------------

const MAX_USER_TURNS = 10;

/**
 * Trim messages to only include the last MAX_USER_TURNS user messages
 * and everything that follows each (assistant responses, tool calls, etc).
 * Returns the full array if there are fewer than MAX_USER_TURNS user messages.
 */
function windowMessages(messages: JSONLMessage[], isActive: boolean): JSONLMessage[] {
  if (!isActive) return messages;

  // Find indices of "real" user messages (ones that produce visible nodes)
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== 'user') continue;
    const content = (msg as any).message?.content;
    if (content == null) continue;
    // Skip tool_result-only messages (they don't produce nodes)
    if (Array.isArray(content)) {
      const hasOnlyToolResults = content.length > 0 && content.every((b: any) => b.type === 'tool_result');
      if (hasOnlyToolResults) continue;
      // Skip if no text blocks
      const hasText = content.some((b: any) => b.type === 'text' && b.text?.trim());
      if (!hasText) continue;
    }
    userIndices.push(i);
  }

  if (userIndices.length <= MAX_USER_TURNS) return messages;

  // Start from the (N-th from last) user message
  const cutoff = userIndices[userIndices.length - MAX_USER_TURNS];
  return messages.slice(cutoff);
}

// ---------------------------------------------------------------------------
// fullRebuild: runs buildGraph + applyFilters. Use when rawMessages change.
// filterOnly: reuses cached buildGraph output. Use for filter/search/collapse.
// ---------------------------------------------------------------------------

function fullRebuild(state: SessionState, messages: JSONLMessage[]) {
  const activeSession = state.sessions.find(s => s.filePath === state.activeSessionPath);
  const endReason: SessionEndReason | undefined = activeSession?.endReason;
  const isActive = endReason === 'active';

  const windowed = windowMessages(messages, isActive);
  const { nodes: allNodes, edges: allEdges } = buildGraph(windowed, endReason);
  const { nodes, edges } = applyFilters(
    allNodes, allEdges,
    state.showThinking, state.showText, state.showSystem,
    state.collapsedNodes, state.searchQuery,
  );
  return { allNodes, allEdges, nodes, edges };
}

function filterOnly(state: SessionState, overrides: {
  showThinking?: boolean;
  showText?: boolean;
  showSystem?: boolean;
  collapsedNodes?: Set<string>;
  searchQuery?: string;
}) {
  return applyFilters(
    state._cachedAllNodes,
    state._cachedAllEdges,
    overrides.showThinking ?? state.showThinking,
    overrides.showText ?? state.showText,
    overrides.showSystem ?? state.showSystem,
    overrides.collapsedNodes ?? state.collapsedNodes,
    overrides.searchQuery ?? state.searchQuery,
  );
}

const EMPTY_STATS: TokenStats = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, estimatedCost: 0 };

export const useSessionStore = create<SessionState>((set, get) => ({
  // Session management
  sessions: [],
  activeSessionPath: null,

  // Graph data
  rawMessages: [],
  nodes: [],
  edges: [],

  // Cached unfiltered graph
  _cachedAllNodes: [],
  _cachedAllEdges: [],

  // Per-session message cache
  _sessionCache: new Map<string, JSONLMessage[]>(),

  // UI state
  selectedNodeId: null,
  layoutDirection: 'TB',
  showThinking: true,
  showText: true,
  showSystem: true,
  autoFollow: true,
  centerRequested: false,
  hasNewNodesSinceManualPan: false,
  newNodeIds: new Set<string>(),
  liveActivity: 'idle' as LiveActivity,
  lastActivityTime: 0,
  collapsedNodes: new Set<string>(),
  searchQuery: '',
  tokenStats: EMPTY_STATS,

  // ── Actions ──────────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (path) => {
    const state = get();
    const cache = state._sessionCache;

    // Save current session's messages to cache before switching away
    if (state.activeSessionPath && state.rawMessages.length > 0) {
      cache.set(state.activeSessionPath, state.rawMessages);
      // LRU eviction: keep at most 10 cached sessions
      if (cache.size > 10) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
    }

    // Try to restore from cache for instant display
    const cached = cache.get(path);
    if (cached && cached.length > 0) {
      const { allNodes, allEdges, nodes, edges } = fullRebuild(state, cached);
      const activity = detectActivity(cached);
      const tokenStats = computeTokenStats(cached);
      set({
        activeSessionPath: path,
        rawMessages: cached,
        _cachedAllNodes: allNodes,
        _cachedAllEdges: allEdges,
        nodes,
        edges,
        selectedNodeId: null,
        newNodeIds: new Set<string>(),
        collapsedNodes: new Set<string>(),
        searchQuery: '',
        liveActivity: activity,
        lastActivityTime: Date.now(),
        tokenStats,
        centerRequested: false,
        hasNewNodesSinceManualPan: false,
      });
    } else {
      set({
        activeSessionPath: path,
        rawMessages: [],
        nodes: [],
        edges: [],
        _cachedAllNodes: [],
        _cachedAllEdges: [],
        selectedNodeId: null,
        newNodeIds: new Set<string>(),
        collapsedNodes: new Set<string>(),
        searchQuery: '',
        tokenStats: EMPTY_STATS,
        centerRequested: false,
        hasNewNodesSinceManualPan: false,
      });
    }
  },

  setMessages: (messages) => {
    const state = get();
    const { allNodes, allEdges, nodes, edges } = fullRebuild(state, messages);
    const activity = detectActivity(messages);
    const tokenStats = computeTokenStats(messages);

    // Keep session cache current
    if (state.activeSessionPath && messages.length > 0) {
      state._sessionCache.set(state.activeSessionPath, messages);
    }

    set({
      rawMessages: messages,
      _cachedAllNodes: allNodes,
      _cachedAllEdges: allEdges,
      nodes,
      edges,
      newNodeIds: new Set<string>(),
      liveActivity: activity,
      lastActivityTime: Date.now(),
      tokenStats,
    });
  },

  appendMessages: (messages) => {
    const state = get();
    const combined = [...state.rawMessages, ...messages];

    let result;
    try {
      result = fullRebuild(state, combined);
    } catch (err) {
      console.error(`[appendMessages] CRASH in fullRebuild: ${String(err)}`);
      return;
    }

    const previousIds = new Set(state.nodes.map((n) => n.id));
    const newIds = new Set<string>();
    for (const node of result.nodes) {
      if (!previousIds.has(node.id)) {
        newIds.add(node.id);
      }
    }

    const nodesWithFlags = result.nodes.map((node) => ({
      ...node,
      isNew: newIds.has(node.id),
    }));

    const activity = detectActivity(combined);

    // Incremental token stats: only compute delta from new messages
    const delta = computeTokenStats(messages);
    const tokenStats: TokenStats = {
      inputTokens: state.tokenStats.inputTokens + delta.inputTokens,
      outputTokens: state.tokenStats.outputTokens + delta.outputTokens,
      cacheRead: state.tokenStats.cacheRead + delta.cacheRead,
      cacheCreation: state.tokenStats.cacheCreation + delta.cacheCreation,
      estimatedCost: state.tokenStats.estimatedCost + delta.estimatedCost,
    };

    // Keep session cache current
    if (state.activeSessionPath) {
      state._sessionCache.set(state.activeSessionPath, combined);
    }

    set({
      rawMessages: combined,
      _cachedAllNodes: result.allNodes,
      _cachedAllEdges: result.allEdges,
      nodes: nodesWithFlags,
      edges: result.edges,
      newNodeIds: newIds,
      liveActivity: activity,
      lastActivityTime: Date.now(),
      tokenStats,
      hasNewNodesSinceManualPan: newIds.size > 0 && !state.autoFollow
        ? true
        : state.hasNewNodesSinceManualPan,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),

  // Filter toggles use filterOnly — skips buildGraph entirely
  toggleShowThinking: () => {
    const state = get();
    const next = !state.showThinking;
    const { nodes, edges } = filterOnly(state, { showThinking: next });
    set({ showThinking: next, nodes, edges });
  },

  toggleShowText: () => {
    const state = get();
    const next = !state.showText;
    const { nodes, edges } = filterOnly(state, { showText: next });
    set({ showText: next, nodes, edges });
  },

  toggleShowSystem: () => {
    const state = get();
    const next = !state.showSystem;
    const { nodes, edges } = filterOnly(state, { showSystem: next });
    set({ showSystem: next, nodes, edges });
  },

  toggleAutoFollow: () => {
    const state = get();
    const next = !state.autoFollow;
    if (next) {
      set({ autoFollow: true, centerRequested: true, hasNewNodesSinceManualPan: false });
    } else {
      set({ autoFollow: false });
    }
  },

  requestCenter: () => set({ centerRequested: true, hasNewNodesSinceManualPan: false }),

  clearCenterRequest: () => set({ centerRequested: false }),

  clearNewNodes: () => {
    const state = get();
    const clearedNodes = state.nodes.map((node) => ({
      ...node,
      isNew: false,
    }));
    set({ nodes: clearedNodes, newNodeIds: new Set<string>() });
  },

  setIdle: () => set({ liveActivity: 'idle' as LiveActivity }),

  toggleCollapse: (nodeId: string) => {
    const state = get();
    const next = new Set(state.collapsedNodes);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);

    const { nodes, edges } = filterOnly(state, { collapsedNodes: next });
    set({ collapsedNodes: next, nodes, edges });
  },

  setSearchQuery: (query: string) => {
    const state = get();
    const { nodes, edges } = filterOnly(state, { searchQuery: query });
    set({ searchQuery: query, nodes, edges });
  },
}));
