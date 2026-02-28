import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
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
import NeonEdge from '../edges/NeonEdge';
import { useSessionStore } from '../store/session-store';
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
};

const edgeTypes = {
  neonEdge: NeonEdge,
};

export default function MindMap() {
  const graphNodes = useSessionStore(s => s.nodes);
  const graphEdges = useSessionStore(s => s.edges);
  const selectNode = useSessionStore(s => s.selectNode);
  const autoFollow = useSessionStore(s => s.autoFollow);
  const centerRequested = useSessionStore(s => s.centerRequested);
  const centerStartRequested = useSessionStore(s => s.centerStartRequested);
  const clearCenterRequest = useSessionStore(s => s.clearCenterRequest);
  const newNodeIds = useSessionStore(s => s.newNodeIds);
  const clearNewNodes = useSessionStore(s => s.clearNewNodes);
  const activeSessionPath = useSessionStore(s => s.activeSessionPath);
  const filterRevision = useSessionStore(s => s._filterRevision);

  const expandedNodeId = useSessionStore(s => s.expandedNodeId);
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
  // Set true on user interaction, cleared on programmatic moves.
  const userPanned = useRef(false);
  const isProgrammaticMove = useRef(false);
  // Single cancelable timer for clearing isProgrammaticMove.
  // Prevents race conditions when multiple programmatic moves overlap.
  const progMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Mark start of a programmatic move. Cancels any pending clear timer. */
  const beginProgrammaticMove = useCallback(() => {
    if (progMoveTimer.current) clearTimeout(progMoveTimer.current);
    isProgrammaticMove.current = true;
  }, []);

  /** Schedule end of programmatic move guard after animation completes. */
  const endProgrammaticMoveAfter = useCallback((ms: number) => {
    if (progMoveTimer.current) clearTimeout(progMoveTimer.current);
    progMoveTimer.current = setTimeout(() => {
      isProgrammaticMove.current = false;
      progMoveTimer.current = null;
    }, ms);
  }, []);

  const onMoveStart = useCallback((_: any, event: any) => {
    // event is null for programmatic moves (setCenter, fitView)
    // event is a real event for user interaction (mouse, touch, wheel)
    if (event && !isProgrammaticMove.current) {
      userPanned.current = true;
      // Gray out the Auto-follow button when user manually pans
      if (useSessionStore.getState().autoFollow) {
        useSessionStore.setState({ autoFollow: false });
      }
    }
  }, []);

  // When session switches (path change or 0→N), fitView to show all.
  // When nodes go from N to N+k (incremental), pan to the newest node
  // ONLY if the user hasn't manually panned away.
  useEffect(() => {
    if (nodes.length === 0) {
      prevNodeCount.current = 0;
      userPanned.current = false;
      return;
    }

    const sessionChanged = activeSessionPath !== prevSessionPath.current;
    prevSessionPath.current = activeSessionPath;

    const wasEmpty = prevNodeCount.current === 0;
    const hasNewNodes = nodes.length > prevNodeCount.current;

    if (sessionChanged || (wasEmpty && nodes.length > 0)) {
      // Session just loaded (from cache, file, or fresh)
      const shouldCenterOnLast = useSessionStore.getState().centerOnLoad;
      useSessionStore.setState({ centerOnLoad: false });
      beginProgrammaticMove();
      if (shouldCenterOnLast) {
        // Banner click — skip fitView, go straight to last node after layout settles
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
        // Normal session switch — fit all nodes into view
        setTimeout(() => {
          fitView({ duration: 400, padding: 0.15 });
          endProgrammaticMoveAfter(500);
        }, 150);
      }
      userPanned.current = false;
    } else if (autoFollow && hasNewNodes && !userPanned.current) {
      // Incremental update — pan to newest node (user hasn't panned away)
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
  }, [nodes.length, activeSessionPath, autoFollow, fitView, setCenter, getZoom, beginProgrammaticMove, endProgrammaticMoveAfter]);

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
        setCenter(x, y, { duration: 400, zoom: 1 });
        endProgrammaticMoveAfter(500);
      }, 100);
    }

    clearCenterRequest();
  }, [centerRequested, nodes, setCenter, getZoom, clearCenterRequest, beginProgrammaticMove, endProgrammaticMoveAfter]);

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

    clearCenterRequest();
  }, [centerStartRequested, nodes, setCenter, getZoom, clearCenterRequest, beginProgrammaticMove, endProgrammaticMoveAfter]);

  // Navigate to a specific node by ID (arrow navigation)
  const centerOnNodeId = useSessionStore(s => s.centerOnNodeId);
  const clearCenterOnNode = useSessionStore(s => s.clearCenterOnNode);
  useEffect(() => {
    if (!centerOnNodeId || nodes.length === 0) return;
    const target = nodes.find(n => n.id === centerOnNodeId);
    if (target && target.position) {
      const nodeWidth = target.measured?.width ?? target.width ?? 200;
      const nodeHeight = target.measured?.height ?? target.height ?? 80;
      const x = (target.position.x as number) + (nodeWidth as number) / 2;
      const y = (target.position.y as number) + (nodeHeight as number) / 2;
      beginProgrammaticMove();
      userPanned.current = false;
      setCenter(x, y, { duration: 400, zoom: 1.2 });
      endProgrammaticMoveAfter(500);
    }
    clearCenterOnNode();
  }, [centerOnNodeId, nodes, setCenter, clearCenterOnNode, beginProgrammaticMove, endProgrammaticMoveAfter]);

  // Clear isNew flags after animation
  useEffect(() => {
    if (newNodeIds.size > 0) {
      const timer = setTimeout(clearNewNodes, 1500);
      return () => clearTimeout(timer);
    }
  }, [newNodeIds, clearNewNodes]);

  const expandNode = useSessionStore(s => s.expandNode);
  const navigateExpandedNode = useSessionStore(s => s.navigateExpandedNode);
  const onNodeClick = useCallback((_: any, node: Node) => {
    const state = useSessionStore.getState();
    if (state.selectedNodeId === node.id) {
      // Already selected — toggle inline expand
      expandNode(state.expandedNodeId === node.id ? null : node.id);
      return;
    }
    // Collapse any expanded node when selecting a different one
    if (state.expandedNodeId) expandNode(null);
    selectNode(node.id);
    // Center and zoom to the clicked node so user can read it
    const nodeWidth = node.measured?.width ?? node.width ?? 340;
    const nodeHeight = node.measured?.height ?? node.height ?? 100;
    const x = (node.position.x as number) + (nodeWidth as number) / 2;
    const y = (node.position.y as number) + (nodeHeight as number) / 2;
    beginProgrammaticMove();
    setCenter(x, y, { duration: 300, zoom: 1.2 });
    endProgrammaticMoveAfter(400);
  }, [selectNode, expandNode, setCenter, beginProgrammaticMove, endProgrammaticMoveAfter]);

  const onPaneClick = useCallback(() => {
    const state = useSessionStore.getState();
    if (state.expandedNodeId) expandNode(null);
    selectNode(null);
  }, [selectNode, expandNode]);

  // Keyboard navigation for expanded nodes: Escape collapses, Arrow keys navigate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!useSessionStore.getState().expandedNodeId) return;
      if (e.key === 'Escape') {
        expandNode(null);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateExpandedNode('prev');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateExpandedNode('next');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandNode, navigateExpandedNode]);

  // Click-to-teleport on minimap: convert SVG click coords → flow coords
  const minimapRef = useRef<HTMLDivElement>(null);
  const onMinimapClick = useCallback((e: React.MouseEvent) => {
    const container = minimapRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox || viewBox.width === 0 || viewBox.height === 0) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const flowX = viewBox.x + ratioX * viewBox.width;
    const flowY = viewBox.y + ratioY * viewBox.height;
    const currentZoom = getZoom();
    beginProgrammaticMove();
    setCenter(flowX, flowY, { duration: 300, zoom: currentZoom });
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
      // Dragging top-left corner: moving left = bigger width, moving up = bigger height
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

  // Constrain panning to the area around nodes (prevents drifting into void)
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

  return (
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
      <div
        ref={minimapRef}
        onClick={onMinimapClick}
        style={{ position: 'absolute', bottom: 10, right: 10 }}
      >
        {/* Resize handle — top-left corner, large grab area */}
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
          {/* Diagonal grip lines */}
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: 'absolute', top: 3, left: 3, opacity: 0.5 }}>
            <line x1="0" y1="12" x2="12" y2="0" stroke="#64748b" strokeWidth="1.5" />
            <line x1="0" y1="8" x2="8" y2="0" stroke="#64748b" strokeWidth="1.5" />
            <line x1="0" y1="4" x2="4" y2="0" stroke="#64748b" strokeWidth="1.5" />
          </svg>
        </div>
        <MiniMap
          nodeColor={(n) => {
            const gn = n.data as any;
            if (gn?.kind === 'user') return '#34d399';
            if (gn?.kind === 'tool_use') return TOOL_COLORS[gn.toolName] || '#6b7280';
            if (gn?.kind === 'thinking') return '#a855f7';
            if (gn?.kind === 'text') return '#6b7280';
            if (gn?.kind === 'compaction') return '#fbbf24';
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
  );
}
