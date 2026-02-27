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
    default:
      return toolName;
  }
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

  // ---- Second pass: build nodes ----
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

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

      if (typeof content === 'string') {
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
          },
          msg.uuid,
        );
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
        },
        msg.uuid,
      );
      continue;
    }

    // ---- Assistant messages ----
    if (msg.type === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const content = assistantMsg.message?.content;
      if (!Array.isArray(content)) continue;

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
              },
              msg.uuid,
            );
            break;
          }

          case 'text': {
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
              },
              msg.uuid,
            );
            break;
          }

          case 'tool_use': {
            const status = resolveToolStatus(block.id, toolResults);
            addNode(
              {
                id: `${msg.uuid}-${i}`,
                parentId: msg.parentUuid,
                kind: 'tool_use',
                toolName: block.name,
                label: formatToolLabel(block.name, block.input),
                detail: JSON.stringify(block.input, null, 2),
                status,
                timestamp: msg.timestamp,
                isNew: false,
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
