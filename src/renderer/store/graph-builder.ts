import type {
  JSONLMessage,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  GraphNode,
  GraphEdge,
  GraphNodeKind,
  ToolStatus,
  ContentBlock,
  SessionEndReason,
} from '../../shared/types';
import { TOOL_COLORS } from '../../shared/types';

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

const MAX_DETAIL_LENGTH = 3000;
function truncateDetail(s: string): string {
  return s.length > MAX_DETAIL_LENGTH ? s.slice(0, MAX_DETAIL_LENGTH) + '\n... (truncated)' : s;
}

function formatToolLabel(toolName: string, input: any): string {
  switch (toolName) {
    case 'Bash':
      return input?.command ? `Bash: ${truncate(String(input.command), 100)}` : 'Bash';
    case 'Read':
      return input?.file_path ? `Read: ${input.file_path}` : 'Read';
    case 'Edit':
      return input?.file_path ? `Edit: ${input.file_path}` : 'Edit';
    case 'Write':
      return input?.file_path ? `Write: ${input.file_path}` : 'Write';
    case 'Grep':
      return input?.pattern ? `Grep: ${truncate(String(input.pattern), 80)}` : 'Grep';
    case 'Glob':
      return input?.pattern ? `Glob: ${truncate(String(input.pattern), 80)}` : 'Glob';
    case 'Task':
      if (input?.prompt) return `Task: ${truncate(String(input.prompt), 80)}`;
      if (input?.description) return `Task: ${truncate(String(input.description), 80)}`;
      return 'Task';
    case 'AskUserQuestion': {
      const q = input?.questions?.[0]?.question;
      return q ? truncate(String(q), 100) : 'Question';
    }
    default: {
      // MCP tools: extract provider + method for a readable label
      const mcpMatch = toolName.match(/^mcp__(?:claude_ai_)?(.+?)__(.+)$/i);
      if (mcpMatch) {
        const provider = mcpMatch[1].replace(/_/g, ' ');
        const method = mcpMatch[2].replace(/_/g, ' ');
        return `${provider}: ${method}`;
      }
      return toolName;
    }
  }
}

/** Extract options and user's choice from an AskUserQuestion tool_use node. */
function extractQuestionData(
  input: any,
  toolUseId: string,
  toolResults: Map<string, string>,
): { questionText?: string; questionOptions?: { label: string; chosen: boolean }[] } {
  const questions = input?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return {};

  const q = questions[0];
  const options: { label: string }[] = q.options || [];
  const resultText = toolResults.get(toolUseId) || '';

  // The tool_result text contains the chosen option label, e.g.:
  // 'User has answered your questions: "question?"="chosen label"'
  const questionOptions = options.map((opt: any) => ({
    label: String(opt.label || ''),
    chosen: resultText.includes(`="${opt.label}"`),
  }));

  return { questionText: q.question, questionOptions };
}

// ---------------------------------------------------------------------------
// Tool-status resolution
// ---------------------------------------------------------------------------

function resolveToolStatus(
  toolUseId: string,
  toolResults: Map<string, string>,
): ToolStatus {
  const result = toolResults.get(toolUseId);
  if (result === undefined) return 'running';

  // Ensure result is a string (tool_result content can be an array of blocks)
  const text = typeof result === 'string' ? result : String(result);
  const lower = text.toLowerCase();
  if (lower.includes('error')) return 'error';

  // Match "exit code" followed by a non-zero number
  const exitCodeMatch = lower.match(/exit code\s+(\d+)/);
  if (exitCodeMatch && exitCodeMatch[1] !== '0') return 'error';

  return 'success';
}

// ---------------------------------------------------------------------------
// Main graph builder
// ---------------------------------------------------------------------------

export function buildGraph(
  messages: JSONLMessage[],
  endReason?: SessionEndReason,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // ---- First pass: collect tool results ----
  const toolResults = new Map<string, string>();

  for (const msg of messages) {
    if (msg.type !== 'user') continue;
    const userMsg = msg as UserMessage;
    const content = userMsg.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_result') {
        // content can be a string or an array of content blocks
        const raw = block.content;
        let text = '';
        if (typeof raw === 'string') {
          text = raw;
        } else if (Array.isArray(raw)) {
          text = raw
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text ?? '')
            .join('\n');
        }
        toolResults.set(block.tool_use_id, text);
      }
    }
  }

  // ---- Collect assistant text for reply-to snippets ----
  // Build parentUuid lookup and map ALL assistant chunk uuids (same API call) to text.
  // Claude Code writes multiple streaming chunks per API call with different uuids,
  // and may inject system messages between turns, so we need to walk the parent chain.
  const parentOf = new Map<string, string>();
  const assistantTextByUuid = new Map<string, string>();
  {
    // Collect text per API call (message.id), and map each chunk uuid → message.id
    const textByMid = new Map<string, string>();
    const uuidToMid = new Map<string, string>();
    for (const msg of messages) {
      if (msg.uuid && msg.parentUuid) parentOf.set(msg.uuid, msg.parentUuid);
      if (msg.type !== 'assistant') continue;
      const m = (msg as any).message;
      const mid = m?.id || '';
      if (mid) uuidToMid.set(msg.uuid, mid);
      const content = m?.content;
      if (!Array.isArray(content)) continue;
      for (let i = content.length - 1; i >= 0; i--) {
        if (content[i].type === 'text' && content[i].text?.trim()) {
          textByMid.set(mid, content[i].text);
          break;
        }
      }
    }
    // Map every assistant chunk uuid to its API call's text
    for (const [uuid, mid] of uuidToMid) {
      const text = textByMid.get(mid);
      if (text) assistantTextByUuid.set(uuid, text);
    }
  }

  /** Walk the parent chain to find the nearest assistant text snippet. */
  function findReplySnippet(startUuid: string | null | undefined): string | undefined {
    let cur = startUuid;
    for (let i = 0; i < 20 && cur; i++) {
      const text = assistantTextByUuid.get(cur);
      if (text) return truncate(text, 80);
      cur = parentOf.get(cur);
    }
    return undefined;
  }

  // ---- Second pass: build nodes ----
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Track first text response after each user message
  let awaitingFirstResponse = false;

  // Maps a message uuid to the id(s) of nodes created for it.
  // We keep an array to handle messages that produce multiple nodes
  // (e.g. assistant messages with several content blocks).
  const uuidToNodeIds = new Map<string, string[]>();

  // Redirect map for skipped messages (e.g. tool_result-only user messages).
  // When a message is skipped, its uuid redirects to its parentUuid so that
  // downstream messages still connect to the right ancestor node.
  const skipRedirect = new Map<string, string>();

  function addNode(node: GraphNode, uuid: string): void {
    // Pre-compute lowercase search text once
    node._searchText = (node.label + '\n' + node.detail + '\n' + (node.toolName || '')).toLowerCase();
    nodes.push(node);
    const list = uuidToNodeIds.get(uuid);
    if (list) {
      list.push(node.id);
    } else {
      uuidToNodeIds.set(uuid, [node.id]);
    }
  }

  for (const msg of messages) {
    // Skip progress and any unrecognised message types
    if (msg.type === 'progress') continue;
    if (msg.type !== 'user' && msg.type !== 'assistant' && msg.type !== 'system') continue;

    // ---- User messages ----
    if (msg.type === 'user') {
      const userMsg = msg as UserMessage;
      const content = userMsg.message?.content;

      if (content == null) continue;

      // Resolve reply-to snippet: walk parent chain through system messages
      // and across streaming chunks to find the nearest assistant text
      const replyToSnippet = findReplySnippet(msg.parentUuid);

      if (typeof content === 'string') {
        // Skip system-injected messages (task notifications, system reminders, etc.)
        const trimmed = content.trimStart();
        if (trimmed.startsWith('<task-notification>') || trimmed.startsWith('<system-reminder>')) {
          if (msg.parentUuid) {
            skipRedirect.set(msg.uuid, msg.parentUuid);
          }
          continue;
        }

        addNode(
          {
            id: msg.uuid,
            parentId: msg.parentUuid,
            kind: 'user',
            toolName: null,
            label: truncate(content, 160),
            detail: content,
            status: null,
            timestamp: msg.timestamp,
            isNew: false,
            replyToSnippet: replyToSnippet || undefined,
          },
          msg.uuid,
        );
        awaitingFirstResponse = true;
        continue;
      }

      if (!Array.isArray(content)) continue;

      // Check if content is exclusively tool_result blocks — skip these but
      // record a redirect so downstream messages still link to the parent.
      const hasOnlyToolResults = content.length > 0 && content.every((b) => b.type === 'tool_result');
      if (hasOnlyToolResults) {
        if (msg.parentUuid) {
          skipRedirect.set(msg.uuid, msg.parentUuid);
        }
        continue;
      }

      // Extract text from text blocks
      const textParts: string[] = [];
      for (const block of content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        }
      }

      if (textParts.length === 0) {
        if (msg.parentUuid) {
          skipRedirect.set(msg.uuid, msg.parentUuid);
        }
        continue;
      }

      const text = textParts.join('\n');

      // Skip system-injected messages in array content too
      const trimmedText = text.trimStart();
      if (trimmedText.startsWith('<task-notification>') || trimmedText.startsWith('<system-reminder>')) {
        if (msg.parentUuid) {
          skipRedirect.set(msg.uuid, msg.parentUuid);
        }
        continue;
      }

      addNode(
        {
          id: msg.uuid,
          parentId: msg.parentUuid,
          kind: 'user',
          toolName: null,
          label: truncate(text, 160),
          detail: text,
          status: null,
          timestamp: msg.timestamp,
          isNew: false,
          replyToSnippet: replyToSnippet || undefined,
        },
        msg.uuid,
      );
      awaitingFirstResponse = true;
      continue;
    }

    // ---- Assistant messages ----
    if (msg.type === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const content = assistantMsg.message?.content;
      if (!Array.isArray(content)) continue;

      // Extract token usage from this API call
      const usage = (assistantMsg as any).message?.usage;
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;

      for (let i = 0; i < content.length; i++) {
        const block: ContentBlock = content[i];

        switch (block.type) {
          case 'thinking': {
            addNode(
              {
                id: `${msg.uuid}-${i}`,
                parentId: msg.parentUuid,
                kind: 'thinking',
                toolName: null,
                label: truncate(block.thinking, 120),
                detail: block.thinking,
                status: null,
                timestamp: msg.timestamp,
                isNew: false,
                inputTokens,
                outputTokens,
              },
              msg.uuid,
            );
            break;
          }

          case 'text': {
            const isFirst = awaitingFirstResponse;
            if (isFirst) awaitingFirstResponse = false;
            addNode(
              {
                id: `${msg.uuid}-${i}`,
                parentId: msg.parentUuid,
                kind: 'text',
                toolName: null,
                label: truncate(block.text, 80),
                detail: block.text,
                status: null,
                timestamp: msg.timestamp,
                isNew: false,
                isFirstResponse: isFirst,
                inputTokens,
                outputTokens,
              },
              msg.uuid,
            );
            break;
          }

          case 'tool_use': {
            const status = resolveToolStatus(block.id, toolResults);
            const isQuestion = block.name === 'AskUserQuestion';
            const qData = isQuestion ? extractQuestionData(block.input, block.id, toolResults) : {};
            addNode(
              {
                id: `${msg.uuid}-${i}`,
                parentId: msg.parentUuid,
                kind: 'tool_use',
                toolName: block.name,
                label: formatToolLabel(block.name, block.input),
                detail: truncateDetail(JSON.stringify(block.input, null, 2)),
                status,
                timestamp: msg.timestamp,
                isNew: false,
                inputTokens,
                outputTokens,
                ...qData,
              },
              msg.uuid,
            );
            break;
          }

          // Unknown content block types are silently skipped
          default:
            break;
        }
      }
      continue;
    }

    // ---- System messages ----
    if (msg.type === 'system') {
      const sysMsg = msg as SystemMessage;

      // Compaction boundary — special node
      if (sysMsg.subtype === 'compact_boundary') {
        const meta = sysMsg.compactMetadata as { trigger?: string; preTokens?: number } | undefined;
        const preTokens = meta?.preTokens ?? 0;
        const logicalParent = (sysMsg as any).logicalParentUuid ?? msg.parentUuid;

        addNode(
          {
            id: msg.uuid,
            parentId: logicalParent,
            kind: 'compaction',
            toolName: null,
            label: `Compacted (${formatTokens(preTokens)} tokens)`,
            detail: `Trigger: ${meta?.trigger ?? 'unknown'}\nPre-compaction tokens: ${preTokens.toLocaleString()}`,
            status: null,
            timestamp: msg.timestamp,
            isNew: false,
            compactTokens: preTokens,
          },
          msg.uuid,
        );
        continue;
      }

      // Generic system message (turn_duration, etc.)
      addNode(
        {
          id: msg.uuid,
          parentId: msg.parentUuid,
          kind: 'system',
          toolName: null,
          label: 'System',
          detail: '',
          status: null,
          timestamp: msg.timestamp,
          isNew: false,
        },
        msg.uuid,
      );
      continue;
    }
  }

  // ---- Edge building ----
  // Follow skip redirects to resolve a uuid to an ancestor that has nodes.
  function resolveUuid(uuid: string): string {
    const visited = new Set<string>();
    let current = uuid;
    while (skipRedirect.has(current) && !visited.has(current)) {
      visited.add(current);
      current = skipRedirect.get(current)!;
    }
    return current;
  }

  for (const msg of messages) {
    if (!msg.parentUuid) continue;

    const resolvedParent = resolveUuid(msg.parentUuid);
    const parentNodeIds = uuidToNodeIds.get(resolvedParent);
    if (!parentNodeIds || parentNodeIds.length === 0) continue;

    // Connect from the last node created for the parent UUID
    const sourceId = parentNodeIds[parentNodeIds.length - 1];

    const childNodeIds = uuidToNodeIds.get(msg.uuid);
    if (!childNodeIds || childNodeIds.length === 0) continue;

    // Connect to the first node created for this UUID
    const targetId = childNodeIds[0];

    edges.push({
      id: `${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
    });

    // If multiple nodes were created for this message, chain them together
    for (let i = 1; i < childNodeIds.length; i++) {
      edges.push({
        id: `${childNodeIds[i - 1]}->${childNodeIds[i]}`,
        source: childNodeIds[i - 1],
        target: childNodeIds[i],
      });
    }
  }

  // ---- Compute turn tokens for user nodes ----
  // Walk messages: each user message starts a turn, accumulate assistant tokens until next user msg.
  // Dedup by message.id since streaming chunks repeat usage for the same API call.
  {
    const userNodeMap = new Map<string, GraphNode>();
    for (const n of nodes) {
      if (n.kind === 'user') userNodeMap.set(n.id, n);
    }

    let currentUserNode: GraphNode | null = null;
    // Map of message.id → { in, out } for the current turn (last chunk wins)
    let turnUsage = new Map<string, { in: number; out: number }>();

    function flushTurn() {
      if (!currentUserNode || turnUsage.size === 0) return;
      let turnIn = 0;
      let turnOut = 0;
      for (const u of turnUsage.values()) {
        turnIn += u.in;
        turnOut += u.out;
      }
      if (turnIn > 0 || turnOut > 0) {
        currentUserNode.turnInputTokens = turnIn;
        currentUserNode.turnOutputTokens = turnOut;
      }
    }

    for (const msg of messages) {
      if (msg.type === 'user') {
        flushTurn();
        currentUserNode = userNodeMap.get(msg.uuid) || null;
        turnUsage = new Map();
      } else if (msg.type === 'assistant' && currentUserNode) {
        const m = (msg as any).message;
        const usage = m?.usage;
        if (usage) {
          const mid = m?.id || msg.uuid;
          // Overwrite: later chunk for same API call has final usage
          turnUsage.set(mid, {
            in: usage.input_tokens || 0,
            out: usage.output_tokens || 0,
          });
        }
      }
    }
    flushTurn();
  }

  // ---- Mark last message for active sessions ----
  // Find the last text or AskUserQuestion node and flag it so the renderer
  // can show an expanded preview matching what the terminal displays.
  // Only marks a node if it's truly the final substantive node (Claude is
  // waiting for the user). Skips system/thinking nodes but stops at any
  // tool_use (means Claude is still working) or user node.
  if (endReason === 'active' && nodes.length > 0) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.kind === 'text') {
        n.isLastMessage = true;
        // Show more content than the default 80-char label
        n.label = truncate(n.detail, 500);
        break;
      }
      if (n.kind === 'tool_use' && n.toolName === 'AskUserQuestion') {
        n.isLastMessage = true;
        break;
      }
      // Skip system and thinking nodes — they don't indicate Claude is working
      if (n.kind === 'system' || n.kind === 'thinking') continue;
      // Any other node kind (tool_use, user, compaction) means Claude isn't
      // waiting for user input — don't mark anything
      break;
    }
  }

  // ---- Synthetic session-end node ----
  if (endReason && endReason !== 'active' && nodes.length > 0) {
    const lastNode = nodes[nodes.length - 1];
    const endId = '__session_end__';
    const endLabel = endReason === 'compacted' ? 'Session Compacted' : 'Session Ended';
    const endDetail = endReason === 'compacted'
      ? 'Context was compressed. A new session may continue this work.'
      : 'No further messages were recorded.';
    nodes.push({
      id: endId,
      parentId: lastNode.id,
      kind: 'session_end',
      toolName: null,
      label: endLabel,
      detail: endDetail,
      status: null,
      timestamp: lastNode.timestamp,
      isNew: false,
      endReason,
      _searchText: (endLabel + '\n' + endDetail).toLowerCase(),
    });
    edges.push({
      id: `${lastNode.id}->${endId}`,
      source: lastNode.id,
      target: endId,
    });
  }

  return { nodes, edges };
}
