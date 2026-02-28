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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiveActivity = 'idle' | 'thinking' | 'tool_running' | 'responding' | 'waiting_on_user' | 'compacting';

export interface ActivityInfo {
  activity: LiveActivity;
  detail?: string;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  estimatedCost: number;
}

export type PaneId = 'primary' | 'secondary';

export interface PaneState {
  sessionPath: string | null;
  rawMessages: JSONLMessage[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  _cachedAllNodes: GraphNode[];
  _cachedAllEdges: GraphEdge[];
  selectedNodeId: string | null;
  expandedNodeId: string | null;
  autoFollow: boolean;
  centerRequested: boolean;
  centerStartRequested: boolean;
  centerOnLoad: boolean;
  centerOnNodeId: string | null;
  hasNewNodesSinceManualPan: boolean;
  newNodeIds: Set<string>;
  collapsedNodes: Set<string>;
  searchQuery: string;
  _filterRevision: number;
  liveActivity: LiveActivity;
  liveActivityDetail: string | undefined;
  lastActivityTime: number;
  tokenStats: TokenStats;
  isWindowed: boolean;
  totalMessageCount: number;
  turnStartTime: number;
  turnOutputTokens: number;
  turnThinkingMs: number;
  _thinkingStartedAt: number | null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SessionState {
  // Shared state
  sessions: SessionInfo[];
  layoutDirection: LayoutDirection;
  showThinking: boolean;
  showText: boolean;
  showSystem: boolean;
  backgroundActivities: Map<string, { activity: LiveActivity; detail?: string; sessionName: string; lastReply?: string }>;
  _sessionCache: Map<string, JSONLMessage[]>;
  splitMode: boolean;

  // Pane state
  panes: Record<PaneId, PaneState>;
  focusedPane: PaneId;

  // ── Actions ──

  // Session management
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (paneId: PaneId, path: string, opts?: { centerOnLoad?: boolean }) => void;
  setFocusedPane: (paneId: PaneId) => void;
  swapPanes: () => void;
  toggleSplitMode: () => void;

  // Message management (per-pane)
  setMessages: (paneId: PaneId, messages: JSONLMessage[]) => void;
  appendMessages: (paneId: PaneId, messages: JSONLMessage[]) => void;

  // UI interaction (per-pane, defaults to focusedPane)
  selectNode: (id: string | null, paneId?: PaneId) => void;
  expandNode: (id: string | null, paneId?: PaneId) => void;
  toggleAutoFollow: (paneId?: PaneId) => void;
  requestCenter: (paneId?: PaneId) => void;
  requestCenterStart: (paneId?: PaneId) => void;
  clearCenterRequest: (paneId?: PaneId) => void;
  clearNewNodes: (paneId?: PaneId) => void;
  setIdle: (paneId?: PaneId) => void;
  toggleCollapse: (nodeId: string, paneId?: PaneId) => void;
  setSearchQuery: (query: string, paneId?: PaneId) => void;
  loadFullSession: (paneId?: PaneId) => void;
  clearCenterOnNode: (paneId?: PaneId) => void;
  updatePaneFields: (updates: Partial<PaneState>, paneId?: PaneId) => void;

  // Navigation (per-pane, defaults to focusedPane)
  navigateUserMessage: (direction: 'prev' | 'next', paneId?: PaneId) => void;
  navigateExpandedNode: (direction: 'prev' | 'next', paneId?: PaneId) => void;
  navigateNode: (direction: 'up' | 'down' | 'left' | 'right', paneId?: PaneId) => void;
  navigateToFirstUserMessage: (paneId?: PaneId) => void;
  navigateToLastUserMessage: (paneId?: PaneId) => void;

  // Global actions
  setLayoutDirection: (dir: LayoutDirection) => void;
  toggleShowThinking: () => void;
  toggleShowText: () => void;
  toggleShowSystem: () => void;
  setBackgroundActivities: (map: Map<string, { activity: LiveActivity; detail?: string; sessionName: string; lastReply?: string }>) => void;
}

// ---------------------------------------------------------------------------
// Token cost estimation
// ---------------------------------------------------------------------------

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-haiku-4-20250506': { input: 0.8, output: 4 },
};
const DEFAULT_PRICING = { input: 3, output: 15 };

function computeTokenStats(messages: JSONLMessage[]): TokenStats {
  const lastUsageById = new Map<string, { usage: any; model: string }>();
  for (const msg of messages) {
    if (msg.type !== 'assistant') continue;
    const m = (msg as any).message;
    const usage = m?.usage;
    if (!usage) continue;
    const id = m?.id || '';
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
// Descendant counting
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
    for (const kid of kids) total += count(kid);
    cache.set(nodeId, total);
    return total;
  }
  for (const nodeId of children.keys()) count(nodeId);
  return cache;
}

function getDescendantIds(
  nodeId: string,
  children: Map<string, string[]>,
  stopAtUserNodes?: Set<string>,
): Set<string> {
  const result = new Set<string>();
  const stack = children.get(nodeId) ? [...children.get(nodeId)!] : [];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.add(id);
    if (stopAtUserNodes && stopAtUserNodes.has(id)) continue;
    const kids = children.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Filter pipeline
// ---------------------------------------------------------------------------

export function applyFilters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  showThinking: boolean,
  showText: boolean,
  showSystem: boolean,
  collapsedNodes: Set<string>,
  searchQuery: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  let filtered = nodes.filter((node) => {
    if (!showThinking && node.kind === 'thinking') return false;
    if (!showText && node.kind === 'text') return false;
    if (!showSystem && node.kind === 'system') return false;
    return true;
  });

  let validIds = new Set(filtered.map((n) => n.id));
  let filteredEdges = edges.filter((e) => validIds.has(e.source) && validIds.has(e.target));

  const children = buildChildrenMap(filteredEdges);
  const descendantCounts = computeAllDescendantCounts(children);

  if (collapsedNodes.size > 0) {
    const userIds = new Set(filtered.filter(n => n.kind === 'user').map(n => n.id));
    const hiddenIds = new Set<string>();

    for (const collapsedId of collapsedNodes) {
      if (!validIds.has(collapsedId)) continue;
      for (const descendant of getDescendantIds(collapsedId, children, userIds)) {
        if (!userIds.has(descendant)) hiddenIds.add(descendant);
      }
    }

    let inCollapsedTurn = false;
    for (const node of filtered) {
      if (node.kind === 'user') {
        inCollapsedTurn = collapsedNodes.has(node.id);
      } else if (inCollapsedTurn) {
        hiddenIds.add(node.id);
      }
    }

    filtered = filtered.map((node) => ({
      ...node,
      childCount: descendantCounts.get(node.id) ?? 0,
      collapsed: collapsedNodes.has(node.id),
    }));
    filtered = filtered.filter((n) => !hiddenIds.has(n.id));
    validIds = new Set(filtered.map((n) => n.id));
    filteredEdges = filteredEdges.filter((e) => validIds.has(e.source) && validIds.has(e.target));

    const userNodes = filtered.filter(n => n.kind === 'user');
    const edgeTargets = new Set(filteredEdges.map(e => e.target));
    for (let i = 0; i < userNodes.length - 1; i++) {
      const nextUser = userNodes[i + 1];
      if (!edgeTargets.has(nextUser.id)) {
        filteredEdges.push({
          id: `bridge-${userNodes[i].id}-${nextUser.id}`,
          source: userNodes[i].id,
          target: nextUser.id,
        });
      }
    }
  } else {
    filtered = filtered.map((node) => ({
      ...node,
      childCount: descendantCounts.get(node.id) ?? 0,
      collapsed: false,
    }));
  }

  if (searchQuery.length > 0) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.map((node) => ({
      ...node,
      searchMatch: (node._searchText || '').includes(q),
    }));
  }

  return { nodes: filtered, edges: filteredEdges };
}

// ---------------------------------------------------------------------------
// Activity detection
// ---------------------------------------------------------------------------

export function detectActivity(messages: JSONLMessage[], isKnownActive = false, fileMtime = 0): ActivityInfo {
  if (!isKnownActive && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.timestamp) {
      const age = Date.now() - new Date(last.timestamp).getTime();
      if (age > 30_000) return { activity: 'idle' };
    }
  }

  let lastMessageAge = 0;
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.timestamp) lastMessageAge = Date.now() - new Date(last.timestamp).getTime();
  }

  let sawSystem = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'progress') continue;
    if (msg.type === 'system') {
      if ((msg as any).subtype === 'compact_boundary') return { activity: 'compacting' };
      sawSystem = true;
      continue;
    }
    if (msg.type === 'assistant') {
      const content = (msg as any).message?.content;
      if (!Array.isArray(content) || content.length === 0) continue;
      const last = content[content.length - 1];
      if (sawSystem) {
        if (last.type === 'text') return { activity: 'waiting_on_user' };
        return { activity: 'idle' };
      }
      const stopReason = (msg as any).message?.stop_reason;
      if (stopReason === 'end_turn') return { activity: 'waiting_on_user' };
      const fileAge = fileMtime > 0 ? Date.now() - fileMtime : Infinity;
      const fileRecentlyModified = fileAge < 5_000;
      if (!fileRecentlyModified && lastMessageAge > 8_000) {
        if (last.type === 'thinking' || last.type === 'text') return { activity: 'waiting_on_user' };
      }
      if (last.type === 'thinking') return { activity: 'thinking' };
      if (last.type === 'tool_use') return { activity: 'tool_running', detail: last.name };
      if (last.type === 'text') return { activity: 'responding' };
      return { activity: 'idle' };
    }
    if (msg.type === 'user') return { activity: 'idle' };
    break;
  }
  return { activity: 'idle' };
}

// ---------------------------------------------------------------------------
// Message windowing
// ---------------------------------------------------------------------------

export const MAX_USER_TURNS_ACTIVE = 10;
export const MAX_USER_TURNS_PAST = 20;
export const ACTIVE_EXPAND_TURNS = 2;

export function windowMessages(messages: JSONLMessage[], maxTurns: number): JSONLMessage[] {
  if (maxTurns === Infinity) return messages;
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== 'user') continue;
    const content = (msg as any).message?.content;
    if (content == null) continue;
    if (Array.isArray(content)) {
      const hasOnlyToolResults = content.length > 0 && content.every((b: any) => b.type === 'tool_result');
      if (hasOnlyToolResults) continue;
      const hasText = content.some((b: any) => b.type === 'text' && b.text?.trim());
      if (!hasText) continue;
    }
    userIndices.push(i);
  }
  if (userIndices.length <= maxTurns) return messages;
  const cutoff = userIndices[userIndices.length - maxTurns];
  return messages.slice(cutoff);
}

// ---------------------------------------------------------------------------
// Turn data
// ---------------------------------------------------------------------------

export function computeTurnData(messages: JSONLMessage[]): { turnStartTime: number; turnOutputTokens: number } {
  let turnStartTime = 0;
  let turnOutputTokens = 0;
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

function updateThinkingTracking(
  prevActivity: LiveActivity,
  newActivity: LiveActivity,
  prevThinkingMs: number,
  prevStartedAt: number | null,
  turnChanged: boolean,
): { turnThinkingMs: number; _thinkingStartedAt: number | null } {
  let turnThinkingMs = prevThinkingMs;
  let _thinkingStartedAt = prevStartedAt;
  if (turnChanged) { turnThinkingMs = 0; _thinkingStartedAt = null; }
  if (prevActivity !== 'thinking' && newActivity === 'thinking') {
    _thinkingStartedAt = Date.now();
  } else if (prevActivity === 'thinking' && newActivity !== 'thinking') {
    if (_thinkingStartedAt) { turnThinkingMs += Date.now() - _thinkingStartedAt; _thinkingStartedAt = null; }
  }
  return { turnThinkingMs, _thinkingStartedAt };
}

// ---------------------------------------------------------------------------
// Auto-collapse
// ---------------------------------------------------------------------------

export function autoCollapseUserNodes(nodes: GraphNode[], keepExpanded: number): Set<string> {
  const userNodes: string[] = [];
  for (const n of nodes) {
    if (n.kind === 'user') userNodes.push(n.id);
  }
  const ids = new Set<string>();
  const collapseCount = keepExpanded > 0 ? Math.max(0, userNodes.length - keepExpanded) : userNodes.length;
  for (let i = 0; i < collapseCount; i++) ids.add(userNodes[i]);
  return ids;
}

// ---------------------------------------------------------------------------
// Internal: pane rebuild + filter helpers
// ---------------------------------------------------------------------------

const EMPTY_STATS: TokenStats = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, estimatedCost: 0 };

function createEmptyPaneState(): PaneState {
  return {
    sessionPath: null,
    rawMessages: [],
    nodes: [],
    edges: [],
    _cachedAllNodes: [],
    _cachedAllEdges: [],
    selectedNodeId: null,
    expandedNodeId: null,
    autoFollow: true,
    centerRequested: false,
    centerStartRequested: false,
    centerOnLoad: false,
    centerOnNodeId: null,
    hasNewNodesSinceManualPan: false,
    newNodeIds: new Set<string>(),
    collapsedNodes: new Set<string>(),
    searchQuery: '',
    _filterRevision: 0,
    liveActivity: 'idle',
    liveActivityDetail: undefined,
    lastActivityTime: 0,
    tokenStats: EMPTY_STATS,
    isWindowed: false,
    totalMessageCount: 0,
    turnStartTime: 0,
    turnOutputTokens: 0,
    turnThinkingMs: 0,
    _thinkingStartedAt: null,
  };
}

function updatePaneState(
  state: SessionState,
  paneId: PaneId,
  updates: Partial<PaneState>,
): { panes: Record<PaneId, PaneState> } {
  return {
    panes: {
      ...state.panes,
      [paneId]: { ...state.panes[paneId], ...updates },
    },
  };
}

/** Mark isLastMessage on filtered nodes for active sessions. */
function markLastMessage(nodes: GraphNode[], sessionPath: string | null, sessions: SessionInfo[]): void {
  const activeSession = sessions.find(s => s.filePath === sessionPath);
  if (activeSession?.endReason !== 'active' || nodes.length === 0) return;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind === 'text') {
      n.isLastMessage = true;
      n.label = n.detail.length > 500 ? n.detail.slice(0, 500) + '\u2026' : n.detail;
      break;
    }
    if (n.kind === 'tool_use' && n.toolName === 'AskUserQuestion') { n.isLastMessage = true; break; }
    if (n.kind === 'system' || n.kind === 'thinking') continue;
    break;
  }
}

function paneRebuild(
  sessionPath: string | null,
  sessions: SessionInfo[],
  showThinking: boolean,
  showText: boolean,
  showSystem: boolean,
  searchQuery: string,
  messages: JSONLMessage[],
  maxTurnsOverride?: number,
) {
  const activeSession = sessions.find(s => s.filePath === sessionPath);
  const endReason: SessionEndReason | undefined = activeSession?.endReason;
  const isActive = endReason === 'active';
  const maxTurns = maxTurnsOverride ?? (isActive ? MAX_USER_TURNS_ACTIVE : MAX_USER_TURNS_PAST);
  const windowed = windowMessages(messages, maxTurns);
  const isWindowed = windowed.length < messages.length;
  const { nodes: allNodes, edges: allEdges } = buildGraph(windowed, endReason);

  const autoCollapsed = isActive
    ? autoCollapseUserNodes(allNodes, ACTIVE_EXPAND_TURNS)
    : autoCollapseUserNodes(allNodes, 0);

  const { nodes, edges } = applyFilters(allNodes, allEdges, showThinking, showText, showSystem, autoCollapsed, searchQuery);
  markLastMessage(nodes, sessionPath, sessions);

  return { allNodes, allEdges, nodes, edges, isWindowed, totalMessageCount: messages.length, autoCollapsed };
}

function paneFilterOnly(
  cachedAllNodes: GraphNode[],
  cachedAllEdges: GraphEdge[],
  sessionPath: string | null,
  sessions: SessionInfo[],
  showThinking: boolean,
  showText: boolean,
  showSystem: boolean,
  collapsedNodes: Set<string>,
  searchQuery: string,
) {
  const result = applyFilters(cachedAllNodes, cachedAllEdges, showThinking, showText, showSystem, collapsedNodes, searchQuery);
  markLastMessage(result.nodes, sessionPath, sessions);
  return result;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSessionStore = create<SessionState>((set, get) => ({
  // Shared state
  sessions: [],
  layoutDirection: 'TB',
  showThinking: true,
  showText: true,
  showSystem: true,
  backgroundActivities: new Map(),
  _sessionCache: new Map<string, JSONLMessage[]>(),
  splitMode: false,

  // Pane state
  panes: {
    primary: createEmptyPaneState(),
    secondary: createEmptyPaneState(),
  },
  focusedPane: 'primary',

  // ── Actions ──────────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),

  setFocusedPane: (paneId) => set({ focusedPane: paneId }),

  setActiveSession: (paneId, path, opts) => {
    const state = get();
    const pane = state.panes[paneId];
    const centerOnLoad = opts?.centerOnLoad ?? false;
    const cache = state._sessionCache;

    // Don't set same session in both panes
    const otherPaneId: PaneId = paneId === 'primary' ? 'secondary' : 'primary';
    if (state.panes[otherPaneId].sessionPath === path) return;

    // Save current pane's messages to cache
    if (pane.sessionPath && pane.rawMessages.length > 0) {
      cache.set(pane.sessionPath, pane.rawMessages);
      if (cache.size > 10) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
    }

    // Try to restore from cache
    const cached = cache.get(path);
    const isActive = state.sessions.some(s => s.filePath === path && s.endReason === 'active');
    if (cached && cached.length > 0) {
      const result = paneRebuild(path, state.sessions, state.showThinking, state.showText, state.showSystem, '', cached);
      const { activity, detail } = detectActivity(cached, isActive);
      const tokenStats = computeTokenStats(cached);
      const turnData = computeTurnData(cached);
      set(updatePaneState(state, paneId, {
        sessionPath: path,
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
        centerOnLoad,
        hasNewNodesSinceManualPan: false,
        turnStartTime: turnData.turnStartTime,
        turnOutputTokens: turnData.turnOutputTokens,
        turnThinkingMs: 0,
        _thinkingStartedAt: activity === 'thinking' ? Date.now() : null,
      }));
    } else {
      set(updatePaneState(state, paneId, {
        ...createEmptyPaneState(),
        sessionPath: path,
        centerOnLoad,
      }));
    }
  },

  setMessages: (paneId, messages) => {
    const state = get();
    const pane = state.panes[paneId];
    const result = paneRebuild(pane.sessionPath, state.sessions, state.showThinking, state.showText, state.showSystem, pane.searchQuery, messages);
    const isActive = state.sessions.some(s => s.filePath === pane.sessionPath && s.endReason === 'active');
    const { activity, detail } = detectActivity(messages, isActive);
    const tokenStats = computeTokenStats(messages);
    const turnData = computeTurnData(messages);
    const turnChanged = turnData.turnStartTime !== pane.turnStartTime && turnData.turnStartTime > 0;
    const thinking = updateThinkingTracking(pane.liveActivity, activity, pane.turnThinkingMs, pane._thinkingStartedAt, turnChanged);

    if (pane.sessionPath && messages.length > 0) {
      state._sessionCache.set(pane.sessionPath, messages);
    }

    set(updatePaneState(state, paneId, {
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
    }));
  },

  appendMessages: (paneId, messages) => {
    const state = get();
    const pane = state.panes[paneId];
    const combined = [...pane.rawMessages, ...messages];

    let result;
    try {
      result = paneRebuild(pane.sessionPath, state.sessions, state.showThinking, state.showText, state.showSystem, pane.searchQuery, combined);
    } catch (err) {
      console.error(`[appendMessages] CRASH in paneRebuild: ${String(err)}`);
      return;
    }

    const previousIds = new Set(pane.nodes.map((n) => n.id));
    const newIds = new Set<string>();
    for (const node of result.nodes) {
      if (!previousIds.has(node.id)) newIds.add(node.id);
    }

    const nodesWithFlags = result.nodes.map((node) => ({ ...node, isNew: newIds.has(node.id) }));

    const isActive = state.sessions.some(s => s.filePath === pane.sessionPath && s.endReason === 'active');
    const { activity, detail } = detectActivity(combined, isActive);
    const tokenStats = computeTokenStats(combined);
    const turnData = computeTurnData(combined);
    const turnChanged = turnData.turnStartTime !== pane.turnStartTime && turnData.turnStartTime > 0;
    const thinking = updateThinkingTracking(pane.liveActivity, activity, pane.turnThinkingMs, pane._thinkingStartedAt, turnChanged);

    if (pane.sessionPath) {
      state._sessionCache.set(pane.sessionPath, combined);
    }

    set(updatePaneState(state, paneId, {
      rawMessages: combined,
      _cachedAllNodes: result.allNodes,
      _cachedAllEdges: result.allEdges,
      nodes: nodesWithFlags,
      edges: result.edges,
      collapsedNodes: result.autoCollapsed,
      newNodeIds: newIds,
      liveActivity: activity,
      liveActivityDetail: detail,
      lastActivityTime: Date.now(),
      tokenStats,
      isWindowed: result.isWindowed,
      totalMessageCount: result.totalMessageCount,
      hasNewNodesSinceManualPan: newIds.size > 0 && !pane.autoFollow ? true : pane.hasNewNodesSinceManualPan,
      turnStartTime: turnData.turnStartTime,
      turnOutputTokens: turnData.turnOutputTokens,
      turnThinkingMs: thinking.turnThinkingMs,
      _thinkingStartedAt: thinking._thinkingStartedAt,
    }));
  },

  selectNode: (id, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { selectedNodeId: id, expandedNodeId: null }));
  },

  expandNode: (id, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { expandedNodeId: id }));
  },

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),

  // Filter toggles: global, rebuild BOTH panes
  toggleShowThinking: () => {
    const state = get();
    const next = !state.showThinking;
    const updates: Partial<SessionState> = { showThinking: next };
    const newPanes = { ...state.panes };
    for (const pid of ['primary', 'secondary'] as PaneId[]) {
      const pane = state.panes[pid];
      if (pane.sessionPath && pane._cachedAllNodes.length > 0) {
        const { nodes, edges } = paneFilterOnly(pane._cachedAllNodes, pane._cachedAllEdges, pane.sessionPath, state.sessions, next, state.showText, state.showSystem, pane.collapsedNodes, pane.searchQuery);
        newPanes[pid] = { ...pane, nodes, edges, _filterRevision: pane._filterRevision + 1 };
      }
    }
    set({ ...updates, panes: newPanes });
  },

  toggleShowText: () => {
    const state = get();
    const next = !state.showText;
    const newPanes = { ...state.panes };
    for (const pid of ['primary', 'secondary'] as PaneId[]) {
      const pane = state.panes[pid];
      if (pane.sessionPath && pane._cachedAllNodes.length > 0) {
        const { nodes, edges } = paneFilterOnly(pane._cachedAllNodes, pane._cachedAllEdges, pane.sessionPath, state.sessions, state.showThinking, next, state.showSystem, pane.collapsedNodes, pane.searchQuery);
        newPanes[pid] = { ...pane, nodes, edges, _filterRevision: pane._filterRevision + 1 };
      }
    }
    set({ showText: next, panes: newPanes });
  },

  toggleShowSystem: () => {
    const state = get();
    const next = !state.showSystem;
    const newPanes = { ...state.panes };
    for (const pid of ['primary', 'secondary'] as PaneId[]) {
      const pane = state.panes[pid];
      if (pane.sessionPath && pane._cachedAllNodes.length > 0) {
        const { nodes, edges } = paneFilterOnly(pane._cachedAllNodes, pane._cachedAllEdges, pane.sessionPath, state.sessions, state.showThinking, state.showText, next, pane.collapsedNodes, pane.searchQuery);
        newPanes[pid] = { ...pane, nodes, edges, _filterRevision: pane._filterRevision + 1 };
      }
    }
    set({ showSystem: next, panes: newPanes });
  },

  toggleAutoFollow: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const next = !pane.autoFollow;
    if (next) {
      set(updatePaneState(state, pid, { autoFollow: true, centerRequested: true, hasNewNodesSinceManualPan: false }));
    } else {
      set(updatePaneState(state, pid, { autoFollow: false }));
    }
  },

  requestCenter: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { centerRequested: true, hasNewNodesSinceManualPan: false }));
  },

  requestCenterStart: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { centerStartRequested: true }));
  },

  clearCenterRequest: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { centerRequested: false, centerStartRequested: false }));
  },

  clearNewNodes: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const clearedNodes = pane.nodes.map((node) => ({ ...node, isNew: false }));
    set(updatePaneState(state, pid, { nodes: clearedNodes, newNodeIds: new Set<string>() }));
  },

  setIdle: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { liveActivity: 'idle', liveActivityDetail: undefined }));
  },

  toggleCollapse: (nodeId, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const next = new Set(pane.collapsedNodes);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    const { nodes, edges } = paneFilterOnly(pane._cachedAllNodes, pane._cachedAllEdges, pane.sessionPath, state.sessions, state.showThinking, state.showText, state.showSystem, next, pane.searchQuery);
    set(updatePaneState(state, pid, { collapsedNodes: next, nodes, edges }));
  },

  setSearchQuery: (query, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const { nodes, edges } = paneFilterOnly(pane._cachedAllNodes, pane._cachedAllEdges, pane.sessionPath, state.sessions, state.showThinking, state.showText, state.showSystem, pane.collapsedNodes, query);
    set(updatePaneState(state, pid, { searchQuery: query, nodes, edges }));
  },

  setBackgroundActivities: (map) => set({ backgroundActivities: map }),

  updatePaneFields: (updates, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, updates));
  },

  loadFullSession: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    if (pane.rawMessages.length === 0) return;
    const result = paneRebuild(pane.sessionPath, state.sessions, state.showThinking, state.showText, state.showSystem, pane.searchQuery, pane.rawMessages, Infinity);
    set(updatePaneState(state, pid, {
      _cachedAllNodes: result.allNodes,
      _cachedAllEdges: result.allEdges,
      nodes: result.nodes,
      edges: result.edges,
      collapsedNodes: result.autoCollapsed,
      isWindowed: false,
      totalMessageCount: result.totalMessageCount,
    }));
  },

  navigateUserMessage: (direction, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const userNodes = pane.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;

    const currentId = pane.centerOnNodeId || pane.selectedNodeId;
    const currentIdx = currentId ? userNodes.findIndex((n) => n.id === currentId) : -1;
    let targetIdx: number;
    if (direction === 'next') {
      targetIdx = currentIdx < userNodes.length - 1 ? currentIdx + 1 : userNodes.length - 1;
    } else {
      targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
    }
    set(updatePaneState(state, pid, { centerOnNodeId: userNodes[targetIdx].id, selectedNodeId: userNodes[targetIdx].id, autoFollow: false }));
  },

  navigateExpandedNode: (direction, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const expandedId = pane.expandedNodeId;
    if (!expandedId) return;

    const nodes = pane.nodes;
    const expandedIdx = nodes.findIndex((n) => n.id === expandedId);
    if (expandedIdx === -1) return;

    let colStart = expandedIdx;
    while (colStart > 0 && nodes[colStart].kind !== 'user') colStart--;
    let colEnd = expandedIdx + 1;
    while (colEnd < nodes.length && nodes[colEnd].kind !== 'user') colEnd++;
    const column = nodes.slice(colStart, colEnd);
    const idxInCol = expandedIdx - colStart;
    const nextIdxInCol = direction === 'next' ? Math.min(idxInCol + 1, column.length - 1) : Math.max(idxInCol - 1, 0);
    const target = column[nextIdxInCol];
    if (target && target.id !== expandedId) {
      set(updatePaneState(state, pid, {
        expandedNodeId: target.id,
        selectedNodeId: target.id,
        centerOnNodeId: target.id,
      }));
    }
  },

  navigateNode: (direction, paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const nodes = pane.nodes;
    if (nodes.length === 0) return;

    const isExpanded = !!pane.expandedNodeId;
    const currentId = pane.expandedNodeId || pane.selectedNodeId;

    if (!currentId) {
      const first = nodes[0];
      set(updatePaneState(state, pid, { selectedNodeId: first.id, centerOnNodeId: first.id }));
      return;
    }

    const currentIdx = nodes.findIndex((n) => n.id === currentId);
    if (currentIdx === -1) return;

    let colStart = currentIdx;
    while (colStart > 0 && nodes[colStart].kind !== 'user') colStart--;
    let colEnd = colStart + 1;
    while (colEnd < nodes.length && nodes[colEnd].kind !== 'user') colEnd++;

    if (direction === 'up' || direction === 'down') {
      const column = nodes.slice(colStart, colEnd);
      const idxInCol = currentIdx - colStart;
      const nextIdxInCol = direction === 'down' ? Math.min(idxInCol + 1, column.length - 1) : Math.max(idxInCol - 1, 0);
      const target = column[nextIdxInCol];
      if (!target || target.id === currentId) return;
      if (isExpanded) {
        set(updatePaneState(state, pid, { expandedNodeId: target.id, selectedNodeId: target.id, centerOnNodeId: target.id }));
      } else {
        set(updatePaneState(state, pid, { selectedNodeId: target.id, centerOnNodeId: target.id }));
      }
    } else {
      const userNodes: number[] = [];
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].kind === 'user') userNodes.push(i);
      }
      const currentColIdx = userNodes.indexOf(colStart);
      if (currentColIdx === -1) return;
      const nextColIdx = direction === 'right' ? Math.min(currentColIdx + 1, userNodes.length - 1) : Math.max(currentColIdx - 1, 0);
      if (nextColIdx === currentColIdx) return;

      const nextColStart = userNodes[nextColIdx];
      let nextColEnd = nextColStart + 1;
      while (nextColEnd < nodes.length && nodes[nextColEnd].kind !== 'user') nextColEnd++;
      const nextColumn = nodes.slice(nextColStart, nextColEnd);
      const idxInCol = currentIdx - colStart;
      const targetIdxInCol = Math.min(idxInCol, nextColumn.length - 1);
      const target = nextColumn[targetIdxInCol];
      if (!target) return;
      if (isExpanded) {
        set(updatePaneState(state, pid, { expandedNodeId: target.id, selectedNodeId: target.id, centerOnNodeId: target.id }));
      } else {
        set(updatePaneState(state, pid, { selectedNodeId: target.id, centerOnNodeId: target.id }));
      }
    }
  },

  navigateToFirstUserMessage: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const userNodes = pane.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;
    set(updatePaneState(state, pid, { centerOnNodeId: userNodes[0].id, selectedNodeId: userNodes[0].id, autoFollow: false }));
  },

  navigateToLastUserMessage: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    const pane = state.panes[pid];
    const userNodes = pane.nodes.filter((n) => n.kind === 'user');
    if (userNodes.length === 0) return;
    const last = userNodes[userNodes.length - 1];
    set(updatePaneState(state, pid, { centerOnNodeId: last.id, selectedNodeId: last.id, autoFollow: false }));
  },

  clearCenterOnNode: (paneId?) => {
    const state = get();
    const pid = paneId ?? state.focusedPane;
    set(updatePaneState(state, pid, { centerOnNodeId: null }));
  },

  // ── Split View ──────────────────────────────────────────────────────

  toggleSplitMode: () => {
    const state = get();
    if (state.splitMode) {
      set({
        splitMode: false,
        focusedPane: 'primary',
        ...updatePaneState(state, 'secondary', createEmptyPaneState()),
      });
    } else {
      const other = state.sessions.find(
        (s) => s.endReason === 'active' && s.filePath !== state.panes.primary.sessionPath,
      );
      if (other) {
        // Set split mode, then load the secondary session
        set({ splitMode: true });
        get().setActiveSession('secondary', other.filePath);
      } else {
        set({ splitMode: true });
      }
    }
  },

  swapPanes: () => {
    const state = get();
    if (!state.panes.secondary.sessionPath) return;
    set({
      panes: {
        primary: state.panes.secondary,
        secondary: state.panes.primary,
      },
    });
  },
}));

// ---------------------------------------------------------------------------
// Convenience hooks for pane-aware component reads
// ---------------------------------------------------------------------------

export function usePane<T>(paneId: PaneId, selector: (pane: PaneState) => T): T {
  return useSessionStore(s => selector(s.panes[paneId]));
}

export function useFocusedPane<T>(selector: (pane: PaneState) => T): T {
  return useSessionStore(s => selector(s.panes[s.focusedPane]));
}
