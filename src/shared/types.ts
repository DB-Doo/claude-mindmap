// ---------------------------------------------------------------------------
// Content Blocks
// ---------------------------------------------------------------------------

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock | ToolResultBlock;

// ---------------------------------------------------------------------------
// JSONL Message Types
// ---------------------------------------------------------------------------

export interface BaseMessage {
  type: string;
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  isSidechain?: boolean;
}

export interface UserMessage extends BaseMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | ContentBlock[];
  };
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  message: {
    id: string;
    role: 'assistant';
    model: string;
    content: ContentBlock[];
  };
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  data: unknown;
  parentToolUseID?: string;
  toolUseID?: string;
}

export interface SystemMessage extends BaseMessage {
  type: 'system';
  [key: string]: unknown;
}

export type JSONLMessage = UserMessage | AssistantMessage | ProgressMessage | SystemMessage;

// ---------------------------------------------------------------------------
// Graph Model
// ---------------------------------------------------------------------------

export type GraphNodeKind = 'user' | 'thinking' | 'text' | 'tool_use' | 'system' | 'compaction' | 'session_end';

export type SessionEndReason = 'active' | 'ended' | 'compacted';

export type ToolStatus = 'running' | 'success' | 'error';

export interface GraphNode {
  id: string;
  parentId: string | null;
  kind: GraphNodeKind;
  toolName: string | null;
  label: string;
  detail: string;
  status: ToolStatus | null;
  timestamp: string;
  isNew: boolean;
  /** Number of descendant nodes (set during filtering). */
  childCount?: number;
  /** True when this node is collapsed (children hidden). */
  collapsed?: boolean;
  /** True when this node matches the current search query. */
  searchMatch?: boolean;
  /** For compaction nodes: number of tokens compressed. */
  compactTokens?: number;
  /** For session_end nodes: why the session ended. */
  endReason?: SessionEndReason;
  /** Tokens used by the assistant API call that produced this node. */
  inputTokens?: number;
  outputTokens?: number;
  /** For user nodes: snippet of what they're replying to. */
  replyToSnippet?: string;
  /** For user nodes: total tokens used in the response turn below. */
  turnInputTokens?: number;
  turnOutputTokens?: number;
  /** For AskUserQuestion nodes: the options and user's choice. */
  questionOptions?: { label: string; chosen: boolean }[];
  questionText?: string;
  /** Pre-computed lowercase search text (label + detail + toolName). */
  _searchText?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Session Metadata
// ---------------------------------------------------------------------------

export interface SessionInfo {
  sessionId: string;
  project: string;
  displayText: string;
  /** First user message, shown as subtitle when displayText is a project name. */
  subtitle?: string;
  timestamp: string;
  filePath: string;
  /** Epoch ms when the JSONL file was last modified on disk. */
  lastModified: number;
  /** Why/how this session ended. */
  endReason: SessionEndReason;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type LayoutDirection = 'TB' | 'LR';

// ---------------------------------------------------------------------------
// Tool Color Palette
// ---------------------------------------------------------------------------

export const TOOL_COLORS: Record<string, string> = {
  Bash:              '#ff6b35',
  Read:              '#00d4ff',
  Edit:              '#ff3d71',
  Write:             '#ff3d71',
  Grep:              '#a855f7',
  Glob:              '#a855f7',
  WebFetch:          '#22d3ee',
  WebSearch:         '#22d3ee',
  Task:              '#fbbf24',
  AskUserQuestion:   '#f472b6',
  default:           '#6b7280',
} as const;
