# Claude Mind Map

Electron desktop app that visualizes Claude Code conversation logs as interactive mind map graphs.

**Obsidian notes**: `C:\Users\fderr\Documents\Db_Doo\Claude Mind Map\`
- Read `Claude Mind Map Ideas.md` for current bugs, improvements, and feature ideas
- Read `Claude Mind Map Changelog.md` for history of completed work

**Tech stack**: Electron + Vite + React 18 + TypeScript, @xyflow/react v12, dagre, zustand, framer-motion, chokidar

**GitHub**: https://github.com/DB-Doo/claude-mindmap

## Key Architecture

- `src/main/` — Electron main process (session discovery, JSONL file watching)
- `src/renderer/` — React app (mind map canvas, nodes, store)
- `src/shared/types.ts` — Shared types between main/renderer
- `src/renderer/store/session-store.ts` — Zustand store, owns all state. Has `fullRebuild` (expensive, runs buildGraph) and `filterOnly` (cheap, reuses cached graph)
- `src/renderer/store/graph-builder.ts` — Converts JSONL messages into graph nodes/edges
- JSONL `tool_result.content` can be `string | unknown[]` (array of content blocks) — always handle both
