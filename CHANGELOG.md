# Changelog

All notable changes to Claude Mind Map are documented here. Fully reverse-chronological — newest date first, newest entry first within each date.

---

## 2026-02-28

- **Improvement** — Consistent Particle Speed — Edge particles now travel at 120px/s regardless of edge length. No more racing particles on long cross-column edges. `7696fd8`
- **Improvement** — Smooth Expand Animation — Inline node expansion now animates smoothly: content bounces in (0.6s), surrounding nodes slide to new positions instead of jumping. `f2aeb49`
- **Bug Fix** — Stale Waiting Badge — "Waiting for you" no longer appears mid-response when tool nodes are hidden by auto-collapse. Moved `isLastMessage` marking to after filtering. `6919c24`
- **Improvement** — Fluid Animations — Complete animation overhaul: bouncy springs with float-up entrance, ripple effects on new nodes, organic breathing glow on thinking, fluid bezier curves on all transitions, varied-speed edge particles. `b28527a`
- **Bug Fix** — Expanded Node Horizontal Overlap — Expanded nodes no longer bleed into adjacent columns. Width stays at 340px, content scrolls vertically. `b28527a`
- **Bug Fix** — Collapsed Columns Missing Edges — Collapsed user columns now have bridge edges connecting them so the visual line persists between turns. `b28527a`
- **Improvement** — Inline Node Expansion — Replaced full-screen overlay modal with inline click-to-expand. Second click on a selected node expands it in-place with scrollable full content and purple glow. Escape/pane click to collapse. `cff13a5`
- **Bug Fix** — Responding Status Stuck — Added file mtime check so staleness fallback only triggers when the JSONL file hasn't been written to in 5+ seconds. Fixes false "Waiting on you" on background sessions. `777b229`
- **Improvement** — Prominent Current Banner — Current session banner now has "VIEWING" pill label, larger font (13px), stronger glow. Background banners smaller and faded. `e1c6409`
- **Bug Fix** — Collapse Misses Orphan Nodes — Added order-based collapse strategy to catch response nodes with broken parent UUID chains that escaped edge-based traversal. `b94cbe7`
- **Bug Fix** — Responding Status Stuck — Tuned staleness fallback: 15s → 3s → 8s to balance responsiveness vs false positives. `f962fe2` `c41d29f`
- **Bug Fix** — Node Height Newline Fix — Node height estimate now counts actual newlines so text with bullet points and separators doesn't overlap the next node. `d623686`
- **Improvement** — Banner Waiting Static — "Waiting on you" banner no longer shows animated bouncing dots — static label for a static state. `7805129`
- **Improvement** — Auto-Collapse Tuning — Reduced ACTIVE_EXPAND_TURNS from 5 to 2 so only the last 2 user turns stay expanded. Minimap resize grip z-index fixed. `16fa609`
- **Feature** — Last Message Preview — Active sessions show Claude's last response expanded (500 chars, green glow, "Waiting for you" badge). AskUserQuestion gets "Waiting for your answer" badge. Activity banners made more visible. Fixed node overlap from expanded height. `81b4c3c` `58d35d3` `b57c373`
- **Bug Fix** — Collapse Hides Response Chains — Collapsing a user node no longer hides response chains of subsequent user nodes. `getDescendantIds` now stops traversal at user node boundaries. `bd79c20`
- **Improvement** — Auto-Collapse Active Sessions — Active sessions auto-compact oldest user turns, keeping last 5 expanded. Prevents performance degradation on long-running sessions. `b25b5dc`
- **Bug Fix** — Collapse Hides User Nodes — User message nodes are never hidden by collapse — they always remain visible at the top of their column. `cf41b74`
- **Improvement** — Auto-Collapse Past Sessions — Past sessions auto-collapse user nodes on load, showing only the user message row. Click to expand response chain. Huge perf improvement for large sessions. `3f1785b`
- **Feature** — Expanded Node View — Click a selected node again to open full-screen modal with complete content, tokens, reply chain. Close with Escape/backdrop. `98fe87e`
- **Improvement** — Session Picker Redesign — Active sessions in green glow cards at top. Past sessions grouped by date. Each session shows paginated user message list (10 at a time). `98fe87e`
- **Bug Fix** — Responding Status Stuck — Banner/status bar showed "Responding" indefinitely after Claude finished. Added 15s staleness fallback for active sessions. `793a2e1`
- **Improvement** — Banner Horizontal Redesign — Horizontal two-section pill layout: left = user prompt, right = activity. Current session has glow + indicator. `793a2e1`
- **Improvement** — Resizable Minimap — Drag top-left grip handle to resize minimap (120x80 to 600x500). `793a2e1`
- **Improvement** — Click-to-Zoom Node — Clicking a node centers and zooms to 1.2x for readability. `793a2e1`
- **Bug Fix** — Banner Stale User Prompt — Banners showed old user prompt when sessions had screenshot messages (100KB+ base64). Main process now scans 512KB for last prompt. `ec19421`
- **Improvement** — Sidebar Reply and Context — Sidebar reply traverses full edge chain (BFS) so replies after thinking blocks show. Added "Replying To" section. Activity detection skips staleness check for active sessions. `ec19421`
- **Feature** — Sidebar Reply Display — Clicking a user message node now shows Claude's reply in the sidebar with a green left border. `10ea122`
- **Improvement** — Toolbar Navigation Overhaul — Replaced Start/Recenter with `<<` `<` `>` `>>` nav buttons. Auto-follow grays out on pan or nav click. Fixed node overlap from underestimated heights. `2502c43`
- **Improvement** — Banner Last Prompt and Reply — Activity banners now show last user prompt and Claude's reply snippet instead of session title. Two-line layout for background sessions. `c6bbe8b`

## 2026-02-27

- **Feature** — Live Status Bar — Live status bar at bottom of graph shows elapsed time, output tokens, and thinking duration while Claude responds. Activity-colored, auto-hides when idle. `9a38469`
- **Bug Fix** — Node Click Detail Sidebar — Clicking nodes now opens the detail sidebar. Sidebar always renders a stable flex slot (collapsed when empty). Node dragging disabled to prevent swallowing clicks. `423948f`
- **Bug Fix** — Reply Preview Text Inconsistent — Reply-to snippets now always show on user nodes. Walks parent chain through system messages and maps all streaming chunk uuids to the same text. `284fb0c`
- **Bug Fix** — Water Cost Wrong Active Session — Water/cost/token counts were 4-5x overcounted due to streaming chunk duplication. Deduplicates by message ID, includes cache tokens in water, and uses cache-aware pricing. `7752415`
- **Bug Fix** — Text Overflow Nodes — Long MCP tool names no longer overflow node boxes. Names parsed into readable format (e.g. "Google Calendar: list events"). CSS ellipsis fallback on headers. `da4b0c6`
- **Bug Fix** — System Filter Toggle Layout — Edges no longer disappear after filter toggle. Filter revision counter forces fresh edge IDs so ReactFlow re-renders properly. `dd9ac1f`
- **Bug Fix** — Banner Responding Stuck — Banner no longer shows "Responding" when Claude is done. Uses `stop_reason: "end_turn"` from API response. `796706a`
- **Bug Fix** — System Filter Toggle Layout — Toggling system filter off then on no longer breaks edge layout. Detects scattered re-added nodes and forces full relayout. `48acce3`
- **Improvement** — First Response Emphasis — First text response after each user message gets blue accent and larger text. Tool nodes de-emphasized (85% opacity, 4-line clamp). `04391f5`
- **Bug Fix** — Auto-Follow Drift Fix — Auto-follow no longer drifts due to competing setTimeout timers. Single cancelable timer prevents premature userPanned detection. `ccb663b`
- **Bug Fix** — Banner Activity Detail — Banners now show specific activity (e.g., "Running Bash") and clearly distinguish current vs background sessions. `b6d2311`
- **Bug Fix** — Stale Lock File Detection — Dead sessions with orphaned lock files no longer show as active. Cross-checks JSONL mtime (30min threshold). `9f9ea6f`
- **Improvement** — Multiple Choice Option Visuals — AskUserQuestion nodes have pink styling, show all options with checkmark on chosen one. Distinct minimap color. `52741db`
- **Improvement** — Arrow Navigation Between User Messages — Left/right arrow buttons in toolbar to jump between user messages. `611b1f1`
- **Improvement** — Turn Token Tally on User Nodes — User nodes show total token usage for the response turn below them. `dfacda0`
- **Improvement** — Reply-To Snippet on User Nodes — User nodes show italic snippet of the assistant response they're replying to. `a78ae06`
- **Improvement** — Token Count Per Bubble — Each assistant node shows input/output token counts from its API call as a badge in the header. `8ae2770`
- **Bug Fix** — Inaccurate Activity Banner — Banner now uses real-time liveActivity for current session instead of 3s polled state. Compaction detected as distinct activity. `ddc3922`
- **Improvement** — Past Session Performance — Past sessions now windowed to last 20 user turns for instant loading. "Load all" button in toolbar to opt into full session. Tool input JSON truncated to 3000 chars. `2208140`
- **Bug Fix** — Session Switch View Drift — Switching sessions via sidebar no longer drifts the view to the right. Fixed stale session path lookup in fullRebuild and cache-backed switches being treated as incremental updates. `2208140`
- **Improvement** — Filter Toggle Layout Fix — Toggling system/thinking/text filters now forces a full relayout instead of treating re-added nodes as incremental. Pan bounds increased to 2000px padding. `63ef217`
- **Bug Fix** — Persistent Banners and Lock File Detection — Banners now always show for active sessions (lock file detection instead of 5-min mtime). Banner click centers on latest message after layout settles. `00e080c`
- **Feature** — Multi-Session Activity Banners — Activity banners now show for ALL active Claude Code sessions, not just the one you're viewing. Background session banners are clickable to switch sessions. `43ee196`
- **Improvement** — Minimap Click-to-Teleport — Clicking anywhere on the minimap instantly teleports the main view to that location. `43ee196`
- **Feature** — Start Button — Toolbar button that centers and zooms (1x) to the first node in the conversation. `eff3e26`
- **Feature** — Water Usage Estimate — Shows estimated water usage (ml) next to cost in toolbar stats. Based on ~0.5L per 1M tokens. `eff3e26`
- **Bug Fix** — Stale Activity Banner — "Claude is responding" banner no longer shows on old/inactive sessions. Checks last message timestamp (>30s = idle). `eff3e26`
- **Improvement** — Pan Bounds — Panning on main canvas and minimap is now constrained to 800px around nodes, preventing drifting into empty void. Minimap zoom disabled. `eff3e26`
- **Feature** — True Minimap — Minimap now shows a zoomed-out preview of all nodes with per-type colors (emerald user, purple thinking, tool-specific, gold compaction). Fixed missing node dimensions that prevented rendering. `ef6a49d`
- **Bug Fix** — System Message Filtering — `<task-notification>` and `<system-reminder>` messages no longer appear as user nodes in the graph. `ef6a49d`
- **Improvement** — Recenter Always Visible — Recenter button now shows at all times when nodes are loaded, not just when auto-follow is off. `ef6a49d`
- **Improvement** — Auto Follow and Recenter — Auto-follow now immediately centers + zooms to latest node when toggled ON. New Recenter button (green, appears when auto-follow off) jumps to latest at 1x zoom. Glows with `*` when new nodes arrive. `0952ee5`
- **Feature** — Conversation Layout — Replaced vertical/horizontal tree layout with conversation layout: user messages run horizontally, Claude responses stack vertically below each. Smooth step edges between columns. `0952ee5`
- **Improvement** — User Messages Stand Out More — User nodes now have a bold left accent bar, stronger emerald glow, and larger text to visually pop against Claude's response nodes.
- **Bug Fix** — Session History Lost on Switch — Per-session message cache with LRU eviction at 10 entries. Switching sessions is now instant.
- **Bug Fix** — EPIPE Crash Fix — Removed console.log from main process and added stdout/stderr error handlers.
- **Improvement** — Performance Optimizations Phase 2 — Replaced dagre with O(n) tree layout, debounced message batching, pre-computed search text, incremental token stats, CSS shadow reduction, active session windowing (last 10 user turns).
- **Bug Fix** — BuildGraph Crash on Array Content — Fixed crash when tool_result content is an array of content blocks (images, text) instead of a string. Root cause of blank maps. `b59e6bf`
- **Improvement** — Performance Optimizations — 8-phase performance overhaul: cached buildGraph, debounced search, memoized descendant counting, conditional animations, edge particle threshold. Large sessions (3000+ msgs) no longer freeze. `b59e6bf`
- **Improvement** — Session Title Accuracy — Session titles now show the latest user prompt instead of the first message. Filters out system-injected messages. `b59e6bf`
- **Feature** — Compaction Nodes — Conversation compaction events now appear as dedicated nodes in the graph. `b59e6bf`
- **Feature** — Session End Indicators — Sessions show a terminal node indicating whether they ended normally or were compacted. `b59e6bf`
- **Feature** — Collapse Expand Nodes — Click a node's child count badge to collapse/expand its subtree. `b59e6bf`
- **Feature** — Grouped Sidebar — Session picker groups sessions by project with collapsible headers. `b59e6bf`

## Earlier Work (pre-changelog)

- **Feature** — Core App — Electron + React Flow mind map visualizer for Claude Code sessions. Real-time JSONL watching, auto-layout, neon styling. `549e5fa`
- **Feature** — Thinking and Waiting Indicators — Live thinking animation and "waiting for user" status on active sessions.
- **Feature** — Search and Filter Toolbar — Filter by node type (thinking/text/system) and search across all node labels.
- **Feature** — Node Detail Panel — Click a node to see full content in a side panel.
- **Feature** — Auto Follow Mode — Camera automatically follows new nodes as they appear.
- **Bug Fix** — Auto Follow Zoom Fix — Fixed auto-follow zooming out to fit all messages instead of staying on current.
- **Bug Fix** — Long Message Truncation Fix — Fixed messages getting cut off when too long.
- **Bug Fix** — Active Session Load Fix — Fixed clicking active session in sidebar sometimes not loading the chat.
