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

export type LiveActivity = 'idle' | 'thinking' | 'tool_running' | 'responding' | 'waiting_on_user' | 'compacting';

export interface ActivityInfo {
  activity: LiveActivity;
  detail?: string; // e.g., tool name for tool_running
}

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
  expandedNodeId: string | null;
  layoutDirection: LayoutDirection;
  showThinking: boolean;
  showText: boolean;
  showSystem: boolean;
  autoFollow: boolean;
  centerRequested: boolean;
  centerStartRequested: boolean;
  centerOnLoad: boolean;
  centerOnNodeId: string | null;
  hasNewNodesSinceManualPan: boolean;
  newNodeIds: Set<string>;
  liveActivity: LiveActivity;
  liveActivityDetail: string | undefined;
  lastActivityTime: number;
  collapsedNodes: Set<string>;
  searchQuery: string;
  tokenStats: TokenStats;
  backgroundActivities: Map<string, { activity: LiveActivity; detail?: string; sessionName: string; lastReply?: string }>;
  isWindowed: boolean;
  totalMessageCount: number;
  _filterRevision: number;

  // Turn tracking (for live status bar)
  turnStartTime: number;
  turnOutputTokens: number;
  turnThinkingMs: number;
  _thinkingStartedAt: number | null;

  // Actions
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (path: string) => void;
  setMessages: (messages: JSONLMessage[]) => void;
  appendMessages: (messages: JSONLMessage[]) => void;
  selectNode: (id: string | null) => void;
  expandNode: (id: string | null) => void;
  setLayoutDirection: (dir: LayoutDirection) => void;
  toggleShowThinking: () => void;
  toggleShowText: () => void;
  toggleShowSystem: () => void;
  toggleAutoFollow: () => void;
  requestCenter: () => void;
  requestCenterStart: () => void;
  clearCenterRequest: () => void;
  clearNewNodes: () => void;
  setIdle: () => void;
  toggleCollapse: (nodeId: string) => void;
  setSearchQuery: (query: string) => void;
  setBackgroundActivities: (map: Map<string, { activity: LiveActivity; detail?: string; sessionName: string; lastReply?: string }>) => void;
  loadFullSession: () => void;
  navigateUserMessage: (direction: 'prev' | 'next') => void;
  navigateToFirstUserMessage: () => void;
  navigateToLastUserMessage: () => void;
  clearCenterOnNode: () => void;
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
  // Deduplicate by message ID — Claude Code writes multiple streaming chunks
  // per API call, each with cumulative usage. Only use the last chunk per ID.
  const lastUsageById = new Map<string, { usage: any; model: string }>();

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue;
    const m = (msg as any).message;
    const usage = m?.usage;
    if (!usage) continue;
    const id = m?.id || '';
    // Later entries for the same ID overwrite earlier ones (last = final usage)
    lastUsageById.set(id, { usage, model: m?.model || '' });
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let estimatedCost = 0;

  for (const { usage, model } of lastUsageById.values()) {
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cRead = usage.cache_read_input_tokens || 0;
    const cCreate = usage.cache_creation_input_tokens || 0;

    inputTokens += inTok;
    outputTokens += outTok;
    cacheRead += cRead;
    cacheCreation += cCreate;

    const price = PRICING[model] || DEFAULT_PRICING;
    // Cache-aware pricing: cache_read at 10%, cache_creation at 125%
    estimatedCost += (
      inTok * price.input +
      cRead * price.input * 0.1 +
      cCreate * price.input * 1.25 +
      outTok * price.output
    ) / 1_000_000;
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
 * When isKnownActive is true (lock file present), skip the staleness check
 * so long-running tools don't falsely show as idle.
 */
export function detectActivity(messages: JSONLMessage[], isKnownActive = false): ActivityInfo {
  // If the last message is more than 30 seconds old and we don't know the session
  // is active, assume it's idle
  if (!isKnownActive && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.timestamp) {
      const age = Date.now() - new Date(last.timestamp).getTime();
      if (age > 30_000) return { activity: 'idle' };
    }
  }

  // Check staleness of the last message — used as a fallback below
  let lastMessageAge = 0;
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.timestamp) {
      lastMessageAge = Date.now() - new Date(last.timestamp).getTime();
    }
  }

  let sawSystem = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Progress messages mean something is actively happening
    if (msg.type === 'progress') continue;

    // System messages (turn duration) appear after Claude finishes a turn.
    // Compaction boundaries mean Claude is actively compacting context.
    if (msg.type === 'system') {
      if ((msg as any).subtype === 'compact_boundary') return { activity: 'compacting' };
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
        if (last.type === 'text') return { activity: 'waiting_on_user' };
        // After a tool_use + system = tool finished, Claude is processing result
        return { activity: 'idle' };
      }

      // Check stop_reason — if the API response is complete, Claude is done
      const stopReason = (msg as any).message?.stop_reason;
      if (stopReason === 'end_turn') return { activity: 'waiting_on_user' };

      // Staleness fallback: if the last message is >15s old and we'd say
      // 'responding' or 'thinking', Claude almost certainly finished and we
      // missed the final signal (streaming chunk timing, watcher delay, etc.)
      if (lastMessageAge > 15_000) {
        if (last.type === 'thinking' || last.type === 'text') {
          return { activity: 'waiting_on_user' };
        }
      }

      if (last.type === 'thinking') return { activity: 'thinking' };
      if (last.type === 'tool_use') return { activity: 'tool_running', detail: last.name };
      if (last.type === 'text') return { activity: 'responding' };
      return { activity: 'idle' };
    }

    // A user message (whether string prompt or tool_result) means
    // Claude hasn't started replying yet — still idle from our POV
    if (msg.type === 'user') return { activity: 'idle' };

    break;
  }
  return { activity: 'idle' };
}

// ---------------------------------------------------------------------------
// Message windowing — show only the last N user turns for performance
// ---------------------------------------------------------------------------

const MAX_USER_TURNS_ACTIVE = 10;
const MAX_USER_TURNS_PAST = 20;

/**
 * Trim messages to only include the last `maxTurns` user messages
 * and everything that follows each (assistant responses, tool calls, etc).
 * Returns the full array if there are fewer than `maxTurns` user messages.
 */
function windowMessages(messages: JSONLMessage[], maxTurns: number): JSONLMessage[] {
  if (maxTurns === Infinity) return messages;

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

  if (userIndices.length <= maxTurns) return messages;

  // Start from the (N-th from last) user message
  const cutoff = userIndices[userIndices.length - maxTurns];
  return messages.slice(cutoff);
}

// ---------------------------------------------------------------------------
// Turn data — per-turn stats for the live status bar
// ---------------------------------------------------------------------------

function computeTurnData(messages: JSONLMessage[]): { turnStartTime: number; turnOutputTokens: number } {
  let turnStartTime = 0;
  let turnOutputTokens = 0;

  // Find last "real" user message (not tool_result-only, not system-injected)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'user') continue;
    const content = (msg as any).message?.content;
    if (content == null) continue;
    if (typeof content === 'string') {
      const trimmed = content.trimStart();
      if (trimmed.startsWith('<task-notification>') || trimmed.startsWith('<system-reminder>')) continue;
    } else if (Array.isArray(content)) {
      const hasOnlyToolResults = content.length > 0 && content.every((b: any) => b.type === 'tool_result');
      if (hasOnlyToolResults) continue;
      const hasText = content.some((b: any) => b.type === 'text' && b.text?.trim());
      if (!hasText) continue;
    }
    turnStartTime = new Date(msg.timestamp).getTime();

    // Sum output tokens from assistant messages after this user msg (deduped by message.id)
    const outputById = new Map<string, number>();
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].type !== 'assistant') continue;
      const m = (messages[j] as any).message;
      const usage = m?.usage;
      if (!usage) continue;
      const mid = m?.id || messages[j].uuid;
      outputById.set(mid, usage.output_tokens || 0);
    }
    for (const t of outputById.values()) turnOutputTokens += t;
    break;
  }

  return { turnStartTime, turnOutputTokens };
}

/** Update thinking duration tracking based on activity transitions. */
function updateThinkingTracking(
  prevActivity: LiveActivity,
  newActivity: LiveActivity,
  prevThinkingMs: number,
  prevStartedAt: number | null,
  turnChanged: boolean,
): { turnThinkingMs: number; _thinkingStartedAt: number | null } {
  let turnThinkingMs = prevThinkingMs;
  let _thinkingStartedAt = prevStartedAt;

  // Reset on new turn
  if (turnChanged) {
    turnThinkingMs = 0;
    _thinkingStartedAt = null;
  }

  // Track transitions
  if (prevActivity !== 'thinking' && newActivity === 'thinking') {
    _thinkingStartedAt = Date.now();
  } else if (prevActivity === 'thinking' && newActivity !== 'thinking') {
    if (_thinkingStartedAt) {
      turnThinkingMs += Date.now() - _thinkingStartedAt;
      _thinkingStartedAt = null;
    }
  }

  return { turnThinkingMs, _thinkingStartedAt };
}

// ---------------------------------------------------------------------------
// fullRebuild: runs buildGraph + applyFilters. Use when rawMessages change.
// filterOnly: reuses cached buildGraph output. Use for filter/search/collapse.
// ---------------------------------------------------------------------------

/** Collect IDs of all user nodes — used to auto-collapse past sessions. */
function getUserNodeIds(nodes: GraphNode[]): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.kind === 'user') ids.add(n.id);
  }
  return ids;
}

function fullRebuild(state: SessionState, messages: JSONLMessage[], maxTurnsOverride?: number) {
  const activeSession = state.sessions.find(s => s.filePath === state.activeSessionPath);
  const endReason: SessionEndReason | undefined = activeSession?.endReason;
  const isActive = endReason === 'active';

  const maxTurns = maxTurnsOverride ?? (isActive ? MAX_USER_TURNS_ACTIVE : MAX_USER_TURNS_PAST);
  const windowed = windowMessages(messages, maxTurns);
  const isWindowed = windowed.length < messages.length;
  const { nodes: allNodes, edges: allEdges } = buildGraph(windowed, endReason);

  // Auto-collapse user nodes for past sessions to reduce node count
  const autoCollapsed = !isActive ? getUserNodeIds(allNodes) : state.collapsedNodes;

  const { nodes, edges } = applyFilters(
    allNodes, allEdges,
    state.showThinking, state.showText, state.showSystem,
    autoCollapsed, state.searchQuery,
  );
  return { allNodes, allEdges, nodes, edges, isWindowed, totalMessageCount: messages.length, autoCollapsed };
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
  expandedNodeId: null,
  layoutDirection: 'TB',
  showThinking: true,
  showText: true,
  showSystem: true,
  autoFollow: true,
  centerRequested: false,
  centerStartRequested: false,
  centerOnLoad: false,
  centerOnNodeId: null,
  hasNewNodesSinceManualPan: false,
  newNodeIds: new Set<string>(),
  liveActivity: 'idle' as LiveActivity,
  liveActivityDetail: undefined as string | undefined,
  lastActivityTime: 0,
  collapsedNodes: new Set<string>(),
  searchQuery: '',
  tokenStats: EMPTY_STATS,
  backgroundActivities: new Map(),
  isWindowed: false,
  totalMessageCount: 0,
  _filterRevision: 0,

  // Turn tracking
  turnStartTime: 0,
  turnOutputTokens: 0,
  turnThinkingMs: 0,
  _thinkingStartedAt: null,

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
    const isActive = state.sessions.some(s => s.filePath === path && s.endReason === 'active');
    if (cached && cached.length > 0) {
      // Pass state with updated activeSessionPath so fullRebuild finds the correct session
      const result = fullRebuild({ ...state, activeSessionPath: path }, cached);
      const { activity, detail } = detectActivity(cached, isActive);
      const tokenStats = computeTokenStats(cached);
      const turnData = computeTurnData(cached);
      set({
        activeSessionPath: path,
        rawMessages: cached,
        _cachedAllNodes: result.allNodes,
        _cachedAllEdges: result.allEdges,
        nodes: result.nodes,
        edges: result.edges,
        selectedNodeId: null,
        expandedNodeId: null,
        newNodeIds: new Set<string>(),
        collapsedNodes: result.autoCollapsed,
        searchQuery: '',
        liveActivity: activity,
        liveActivityDetail: detail,
        lastActivityTime: Date.now(),
        tokenStats,
        isWindowed: result.isWindowed,
        totalMessageCount: result.totalMessageCount,
        centerRequested: false,
        centerStartRequested: false,
        hasNewNodesSinceManualPan: false,
        turnStartTime: turnData.turnStartTime,
        turnOutputTokens: turnData.turnOutputTokens,
        turnThinkingMs: 0,
        _thinkingStartedAt: activity === 'thinking' ? Date.now() : null,
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
        expandedNodeId: null,
        newNodeIds: new Set<string>(),
        collapsedNodes: new Set<string>(),
        searchQuery: '',
        tokenStats: EMPTY_STATS,
        isWindowed: false,
        totalMessageCount: 0,
        centerRequested: false,
        centerStartRequested: false,
        hasNewNodesSinceManualPan: false,
        turnStartTime: 0,
        turnOutputTokens: 0,
        turnThinkingMs: 0,
        _thinkingStartedAt: null,
      });
    }
  },

  setMessages: (messages) => {
    const state = get();
    const result = fullRebuild(state, messages);
    const isActive = state.sessions.some(s => s.filePath === state.activeSessionPath && s.endReason === 'active');
    const { activity, detail } = detectActivity(messages, isActive);
    const tokenStats = computeTokenStats(messages);
    const turnData = computeTurnData(messages);
    const turnChanged = turnData.turnStartTime !== state.turnStartTime && turnData.turnStartTime > 0;
    const thinking = updateThinkingTracking(
      state.liveActivity, activity,
      state.turnThinkingMs, state._thinkingStartedAt, turnChanged,
    );

    // Keep session cache current
    if (state.activeSessionPath && messages.length > 0) {
      state._sessionCache.set(state.activeSessionPath, messages);
    }

    set({
      rawMessages: messages,
      _cachedAllNodes: result.allNodes,
      _cachedAllEdges: result.allEdges,
      nodes: result.nodes,
      edges: result.edges,
      collapsedNodes: result.autoCollapsed,
      newNodeIds: new Set<string>(),
      liveActivity: activity,
      liveActivityDetail: detail,
      lastActivityTime: Date.now(),
      tokenStats,
      isWindowed: result.isWindowed,
      totalMessageCount: result.totalMessageCount,
      turnStartTime: turnData.turnStartTime,
      turnOutputTokens: turnData.turnOutputTokens,
      turnThinkingMs: thinking.turnThinkingMs,
      _thinkingStartedAt: thinking._thinkingStartedAt,
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

    const isActive = state.sessions.some(s => s.filePath === state.activeSessionPath && s.endReason === 'active');
    const { activity, detail } = detectActivity(combined, isActive);

    // Recompute from all messages to stay accurate (dedup handles streaming chunks)
    const tokenStats = computeTokenStats(combined);

    const turnData = computeTurnData(combined);
    const turnChanged = turnData.turnStartTime !== state.turnStartTime && turnData.turnStartTime > 0;
    const thinking = updateThinkingTracking(
      state.liveActivity, activity,
      state.turnThinkingMs, state._thinkingStartedAt, turnChanged,
    );

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
      liveActivityDetail: detail,
      lastActivityTime: Date.now(),
      tokenStats,
      isWindowed: result.isWindowed,
      totalMessageCount: result.totalMessageCount,
      hasNewNodesSinceManualPan: newIds.size > 0 && !state.autoFollow
        ? true
        : state.hasNewNodesSinceManualPan,
      turnStartTime: turnData.turnStartTime,
      turnOutputTokens: turnData.turnOutputTokens,
      turnThinkingMs: thinking.turnThinkingMs,
      _thinkingStartedAt: thinking._thinkingStartedAt,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, expandedNodeId: null }),
  expandNode: (id) => set({ expandedNodeId: id }),

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),

  // Filter toggles use filterOnly — skips buildGraph entirely.
  // _filterRevision is bumped so useAutoLayout generates fresh edge IDs,
  // working around a ReactFlow reconciliation bug where removed-then-re-added
  // edges with the same ID may not render.
  toggleShowThinking: () => {
    const state = get();
    const next = !state.showThinking;
    const { nodes, edges } = filterOnly(state, { showThinking: next });
    set({ showThinking: next, nodes, edges, _filterRevision: state._filterRevision + 1 });
  },

  toggleShowText: () => {
    const state = get();
    const next = !state.showText;
    const { nodes, edges } = filterOnly(state, { showText: next });
    set({ showText: next, nodes, edges, _filterRevision: state._filterRevision + 1 });
  },

  toggleShowSystem: () => {
    const state = get();
    const next = !state.showSystem;
    const { nodes, edges } = filterOnly(state, { showSystem: next });
    set({ showSystem: next, nodes, edges, _filterRevision: state._filterRevision + 1 });
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
  requestCenterStart: () => set({ centerStartRequested: true }),

  clearCenterRequest: () => set({ centerRequested: false, centerStartRequested: false }),

  clearNewNodes: () => {
    const state = get();
    const clearedNodes = state.nodes.map((node) => ({
      ...node,
      isNew: false,
    }));
    set({ nodes: clearedNodes, newNodeIds: new Set<string>() });
  },

  setIdle: () => set({ liveActivity: 'idle' as LiveActivity, liveActivityDetail: undefined }),

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

  setBackgroundActivities: (map) => set({ backgroundActivities: map }),

  loadFullSession: () => {
    const state = get();
    if (state.rawMessages.length === 0) return;
    const result = fullRebuild(state, state.rawMessages, Infinity);
    set({
      _cachedAllNodes: result.allNodes,
      _cachedAllEdges: result.allEdges,
      nodes: result.nodes,
      edges: result.edges,
      collapsedNodes: result.autoCollapsed,
      isWindowed: false,
      totalMessageCount: result.totalMessageCount,
    });
  },

  navigateUserMessage: (direction) => {
    const state = get();
    const userNodes = state.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;

    const currentId = state.centerOnNodeId || state.selectedNodeId;
    const currentIdx = currentId ? userNodes.findIndex((n) => n.id === currentId) : -1;

    let targetIdx: number;
    if (direction === 'next') {
      targetIdx = currentIdx < userNodes.length - 1 ? currentIdx + 1 : userNodes.length - 1;
    } else {
      targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
    }

    set({ centerOnNodeId: userNodes[targetIdx].id, selectedNodeId: userNodes[targetIdx].id, autoFollow: false });
  },

  navigateToFirstUserMessage: () => {
    const state = get();
    const userNodes = state.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;
    set({ centerOnNodeId: userNodes[0].id, selectedNodeId: userNodes[0].id, autoFollow: false });
  },

  navigateToLastUserMessage: () => {
    const state = get();
    const userNodes = state.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;
    const last = userNodes[userNodes.length - 1];
    set({ centerOnNodeId: last.id, selectedNodeId: last.id, autoFollow: false });
  },

  clearCenterOnNode: () => set({ centerOnNodeId: null }),
}));
