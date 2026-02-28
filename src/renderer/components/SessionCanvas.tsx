import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ToolNode from '../nodes/ToolNode';
import UserNode from '../nodes/UserNode';
import ThinkingNode from '../nodes/ThinkingNode';
import TextNode from '../nodes/TextNode';
import SystemNode from '../nodes/SystemNode';
import CompactionNode from '../nodes/CompactionNode';
import SessionEndNode from '../nodes/SessionEndNode';
import QueueNode from '../nodes/QueueNode';
import NeonEdge from '../edges/NeonEdge';
import LiveStatusBar from './LiveStatusBar';
import { useSessionStore, usePane, type PaneId } from '../store/session-store';
import { useAutoLayout } from '../hooks/useAutoLayout';
import { TOOL_COLORS } from '../../shared/types';

const nodeTypes = {
  toolNode: ToolNode,
  userNode: UserNode,
  thinkingNode: ThinkingNode,
  textNode: TextNode,
  systemNode: SystemNode,
  compactionNode: CompactionNode,
  sessionEndNode: SessionEndNode,
  queueNode: QueueNode,
};

const edgeTypes = {
  neonEdge: NeonEdge,
};

// ─── Inner canvas (needs ReactFlowProvider above it) ─────────────────

function SessionCanvasInner({ paneId }: { paneId: PaneId }) {
  const graphNodes = usePane(paneId, p => p.nodes);
  const graphEdges = usePane(paneId, p => p.edges);
  const selectNode = useSessionStore(s => s.selectNode);
  const autoFollow = usePane(paneId, p => p.autoFollow);
  const centerRequested = usePane(paneId, p => p.centerRequested);
  const centerStartRequested = usePane(paneId, p => p.centerStartRequested);
  const clearCenterRequest = useSessionStore(s => s.clearCenterRequest);
  const newNodeIds = usePane(paneId, p => p.newNodeIds);
  const clearNewNodes = useSessionStore(s => s.clearNewNodes);
  const sessionPath = usePane(paneId, p => p.sessionPath);
  const filterRevision = usePane(paneId, p => p._filterRevision);

  const expandedNodeId = usePane(paneId, p => p.expandedNodeId);
  const layoutResult = useAutoLayout(graphNodes, graphEdges, filterRevision, expandedNodeId);

  // Inject isExpanded flag into node data so node components can render inline expansion
  const nodes = useMemo(() => layoutResult.nodes.map(n => {
    if (n.id !== expandedNodeId) return n;
    return { ...n, data: { ...n.data, isExpanded: true }, zIndex: 100 };
  }), [layoutResult.nodes, expandedNodeId]);
  const edges = layoutResult.edges;

  const { fitView, setCenter, getZoom } = useReactFlow();
  const prevNodeCount = useRef(0);
  const prevSessionPath = useRef<string | null>(null);

  // Track whether the user has manually panned/zoomed.
  const userPanned = useRef(false);
  const isProgrammaticMove = useRef(false);
  const progMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginProgrammaticMove = useCallback(() => {
    if (progMoveTimer.current) clearTimeout(progMoveTimer.current);
    isProgrammaticMove.current = true;
  }, []);

  const endProgrammaticMoveAfter = useCallback((ms: number) => {
    if (progMoveTimer.current) clearTimeout(progMoveTimer.current);
    progMoveTimer.current = setTimeout(() => {
      isProgrammaticMove.current = false;
      progMoveTimer.current = null;
    }, ms);
  }, []);

  const onMoveStart = useCallback((_: any, event: any) => {
    if (event && !isProgrammaticMove.current) {
      userPanned.current = true;
      const state = useSessionStore.getState();
      if (state.panes[paneId].autoFollow) {
        state.toggleAutoFollow(paneId);
      }
    }
  }, [paneId]);

  // When session switches or nodes update, handle view positioning
  useEffect(() => {
    if (nodes.length === 0) {
      prevNodeCount.current = 0;
      userPanned.current = false;
      return;
    }

    const sessionChanged = sessionPath !== prevSessionPath.current;
    prevSessionPath.current = sessionPath;

    const wasEmpty = prevNodeCount.current === 0;
    const hasNewNodes = nodes.length > prevNodeCount.current;

    if (sessionChanged || (wasEmpty && nodes.length > 0)) {
      const state = useSessionStore.getState();
      const shouldCenterOnLast = state.panes[paneId].centerOnLoad;
      state.updatePaneFields({ centerOnLoad: false }, paneId);
      beginProgrammaticMove();
      if (shouldCenterOnLast) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode && lastNode.position) {
          const nodeWidth = lastNode.measured?.width ?? lastNode.width ?? 200;
          const nodeHeight = lastNode.measured?.height ?? lastNode.height ?? 80;
          const x = lastNode.position.x + nodeWidth / 2;
          const y = lastNode.position.y + nodeHeight / 2;
          setTimeout(() => {
            setCenter(x, y, { duration: 400, zoom: 1 });
            endProgrammaticMoveAfter(500);
          }, 300);
        } else {
          isProgrammaticMove.current = false;
        }
      } else {
        setTimeout(() => {
          fitView({ duration: 400, padding: 0.15 });
          endProgrammaticMoveAfter(500);
        }, 150);
      }
      userPanned.current = false;
    } else if (autoFollow && hasNewNodes && !userPanned.current) {
      const lastNode = nodes[nodes.length - 1];
      if (lastNode && lastNode.position) {
        const nodeWidth = lastNode.measured?.width ?? lastNode.width ?? 200;
        const nodeHeight = lastNode.measured?.height ?? lastNode.height ?? 80;
        const x = lastNode.position.x + nodeWidth / 2;
        const y = lastNode.position.y + nodeHeight / 2;
        const currentZoom = getZoom();
        beginProgrammaticMove();
        setTimeout(() => {
          setCenter(x, y, { duration: 400, zoom: currentZoom });
          endProgrammaticMoveAfter(500);
        }, 100);
      }
    }

    prevNodeCount.current = nodes.length;
  }, [nodes.length, sessionPath, autoFollow, fitView, setCenter, getZoom, beginProgrammaticMove, endProgrammaticMoveAfter, paneId]);

  // Center-on-demand: triggered by toggleAutoFollow(ON) or Recenter button
  useEffect(() => {
    if (!centerRequested || nodes.length === 0) return;

    const lastNode = nodes[nodes.length - 1];
    if (lastNode && lastNode.position) {
      const nodeWidth = lastNode.measured?.width ?? lastNode.width ?? 200;
      const nodeHeight = lastNode.measured?.height ?? lastNode.height ?? 80;
      const x = lastNode.position.x + nodeWidth / 2;
      const y = lastNode.position.y + nodeHeight / 2;
      beginProgrammaticMove();
      userPanned.current = false;
      setTimeout(() => {
        setCenter(x, y, { duration: 400, zoom: 1.2 });
        endProgrammaticMoveAfter(500);
      }, 100);
    }

    clearCenterRequest(paneId);
  }, [centerRequested, nodes, setCenter, getZoom, clearCenterRequest, beginProgrammaticMove, endProgrammaticMoveAfter, paneId]);

  // Center on first node: triggered by Start button
  useEffect(() => {
    if (!centerStartRequested || nodes.length === 0) return;

    const firstNode = nodes[0];
    if (firstNode && firstNode.position) {
      const nodeWidth = firstNode.measured?.width ?? firstNode.width ?? 200;
      const nodeHeight = firstNode.measured?.height ?? firstNode.height ?? 80;
      const x = firstNode.position.x + nodeWidth / 2;
      const y = firstNode.position.y + nodeHeight / 2;
      const currentZoom = getZoom();
      beginProgrammaticMove();
      userPanned.current = false;
      setTimeout(() => {
        setCenter(x, y, { duration: 400, zoom: Math.max(currentZoom, 0.5) });
        endProgrammaticMoveAfter(500);
      }, 100);
    }

    clearCenterRequest(paneId);
  }, [centerStartRequested, nodes, setCenter, getZoom, clearCenterRequest, beginProgrammaticMove, endProgrammaticMoveAfter, paneId]);

  // Navigate to a specific node by ID (arrow navigation)
  const centerOnNodeId = usePane(paneId, p => p.centerOnNodeId);
  const centerOnNodeBottom = usePane(paneId, p => p.centerOnNodeBottom);
  const clearCenterOnNode = useSessionStore(s => s.clearCenterOnNode);
  useEffect(() => {
    if (!centerOnNodeId || nodes.length === 0) return;
    const target = nodes.find(n => n.id === centerOnNodeId);
    if (target && target.position) {
      const nodeWidth = target.measured?.width ?? target.width ?? 200;
      const nodeHeight = target.measured?.height ?? target.height ?? 80;
      const x = (target.position.x as number) + (nodeWidth as number) / 2;
      const y = centerOnNodeBottom
        ? (target.position.y as number) + (nodeHeight as number)
        : (target.position.y as number) + (nodeHeight as number) / 2;
      beginProgrammaticMove();
      userPanned.current = false;
      setCenter(x, y, { duration: 200, zoom: 1.2 });
      endProgrammaticMoveAfter(300);
    }
    clearCenterOnNode(paneId);
  }, [centerOnNodeId, centerOnNodeBottom, nodes, setCenter, clearCenterOnNode, beginProgrammaticMove, endProgrammaticMoveAfter, paneId]);

  // Clear isNew flags after animation
  useEffect(() => {
    if (newNodeIds.size > 0) {
      const timer = setTimeout(() => clearNewNodes(paneId), 1500);
      return () => clearTimeout(timer);
    }
  }, [newNodeIds, clearNewNodes, paneId]);

  const expandNode = useSessionStore(s => s.expandNode);
  const navigateNode = useSessionStore(s => s.navigateNode);

  const onNodeClick = useCallback((_: any, node: Node) => {
    const state = useSessionStore.getState();
    const pane = state.panes[paneId];
    if (pane.selectedNodeId === node.id) {
      expandNode(pane.expandedNodeId === node.id ? null : node.id, paneId);
      return;
    }
    if (pane.expandedNodeId) expandNode(null, paneId);
    selectNode(node.id, paneId);
    const nodeWidth = node.measured?.width ?? node.width ?? 340;
    const nodeHeight = node.measured?.height ?? node.height ?? 100;
    const x = (node.position.x as number) + (nodeWidth as number) / 2;
    const y = (node.position.y as number) + (nodeHeight as number) / 2;
    beginProgrammaticMove();
    setCenter(x, y, { duration: 300, zoom: 1.2 });
    endProgrammaticMoveAfter(400);
  }, [selectNode, expandNode, setCenter, beginProgrammaticMove, endProgrammaticMoveAfter, paneId]);

  const onPaneClick = useCallback(() => {
    const state = useSessionStore.getState();
    if (state.panes[paneId].expandedNodeId) expandNode(null, paneId);
    selectNode(null, paneId);
  }, [selectNode, expandNode, paneId]);

  // Keyboard navigation: only register once (primary pane), dispatches to focusedPane
  const navThrottleRef = useRef<number>(0);
  const NAV_THROTTLE_MS = 250;
  useEffect(() => {
    if (paneId !== 'primary') return; // Only register once
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (useSessionStore.getState().panes[useSessionStore.getState().focusedPane].expandedNodeId) expandNode(null);
        return;
      }

      const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      };
      const dir = dirMap[e.key];
      if (!dir) return;
      e.preventDefault();

      const now = Date.now();
      if (now - navThrottleRef.current < NAV_THROTTLE_MS) return;
      navThrottleRef.current = now;

      navigateNode(dir);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandNode, navigateNode, paneId]);

  // Click-to-teleport on minimap
  const onMinimapClick = useCallback((_event: React.MouseEvent, position: { x: number; y: number }) => {
    const currentZoom = getZoom();
    beginProgrammaticMove();
    setCenter(position.x, position.y, { duration: 300, zoom: currentZoom });
    endProgrammaticMoveAfter(400);
  }, [setCenter, getZoom, beginProgrammaticMove, endProgrammaticMoveAfter]);

  // Resizable minimap
  const [minimapSize, setMinimapSize] = useState({ w: 200, h: 150 });
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: minimapSize.w, h: minimapSize.h };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const dw = resizeStart.current.x - ev.clientX;
      const dh = resizeStart.current.y - ev.clientY;
      setMinimapSize({
        w: Math.max(120, Math.min(600, resizeStart.current.w + dw)),
        h: Math.max(80, Math.min(500, resizeStart.current.h + dh)),
      });
    };

    const onMouseUp = () => {
      resizing.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [minimapSize]);

  // Constrain panning
  const translateExtent = useMemo((): [[number, number], [number, number]] => {
    if (nodes.length === 0) return [[-Infinity, -Infinity], [Infinity, Infinity]];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.position.x;
      const y = n.position.y;
      const w = (n.width as number) ?? 340;
      const h = (n.height as number) ?? 100;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    const pad = 2000;
    return [[minX - pad, minY - pad], [maxX + pad, maxY + pad]];
  }, [nodes]);

  // Set focus on click
  const onPaneMouseDown = useCallback(() => {
    useSessionStore.getState().setFocusedPane(paneId);
  }, [paneId]);

  // Debug: log node data to help diagnose rendering issues
  useEffect(() => {
    console.log(`[SessionCanvas:${paneId}] nodes=${nodes.length}, edges=${edges.length}, sessionPath=${sessionPath}`);
    if (nodes.length > 0) {
      const first = nodes[0];
      console.log(`[SessionCanvas:${paneId}] first node pos=(${first.position.x}, ${first.position.y}), type=${first.type}`);
    }
  }, [nodes.length, edges.length, sessionPath, paneId]);

  return (
    <div onMouseDown={onPaneMouseDown} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveStart={onMoveStart}
        translateExtent={translateExtent}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a2e" gap={20} size={1} />
        <Controls />
        <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
          {/* Resize handle */}
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 28,
              height: 28,
              cursor: 'nw-resize',
              zIndex: 20,
              borderRadius: '6px 0 0 0',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: 'absolute', top: 3, left: 3, opacity: 0.5 }}>
              <line x1="0" y1="12" x2="12" y2="0" stroke="#64748b" strokeWidth="1.5" />
              <line x1="0" y1="8" x2="8" y2="0" stroke="#64748b" strokeWidth="1.5" />
              <line x1="0" y1="4" x2="4" y2="0" stroke="#64748b" strokeWidth="1.5" />
            </svg>
          </div>
          <MiniMap
            onClick={onMinimapClick}
            nodeColor={(n) => {
              const gn = n.data as any;
              if (gn?.kind === 'user') return '#34d399';
              if (gn?.kind === 'tool_use') return TOOL_COLORS[gn.toolName] || '#6b7280';
              if (gn?.kind === 'thinking') return '#a855f7';
              if (gn?.kind === 'text') return '#6b7280';
              if (gn?.kind === 'compaction') return '#fbbf24';
              if (gn?.kind === 'queue') return '#fbbf24';
              if (gn?.kind === 'session_end') return '#475569';
              return '#475569';
            }}
            style={{
              backgroundColor: '#0d0d14',
              width: minimapSize.w,
              height: minimapSize.h,
              position: 'relative',
            }}
            maskColor="rgba(10, 10, 15, 0.7)"
            pannable
          />
        </div>
      </ReactFlow>
    </div>
  );
}

// ─── Outer wrapper with ReactFlowProvider ────────────────────────────

export default function SessionCanvas({ paneId }: { paneId: PaneId }) {
  return (
    <ReactFlowProvider>
      <SessionCanvasInner paneId={paneId} />
      <LiveStatusBar paneId={paneId} compact={paneId === 'secondary'} />
    </ReactFlowProvider>
  );
}

/** Variant without ReactFlowProvider — use when the provider is supplied by a parent. */
export { SessionCanvasInner };
