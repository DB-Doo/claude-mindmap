import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  const { nodes, edges } = useAutoLayout(graphNodes, graphEdges);
  const { fitView, setCenter, getZoom } = useReactFlow();
  const prevNodeCount = useRef(0);

  // When nodes go from 0 to N (session load/switch), fitView to show all.
  // When nodes go from N to N+k (incremental), pan to the newest node.
  useEffect(() => {
    if (nodes.length === 0) {
      prevNodeCount.current = 0;
      return;
    }

    const wasEmpty = prevNodeCount.current === 0;
    const hasNewNodes = nodes.length > prevNodeCount.current;

    if (wasEmpty && nodes.length > 0) {
      // Session just loaded — fit all nodes into view
      setTimeout(() => {
        fitView({ duration: 400, padding: 0.15 });
      }, 150);
    } else if (autoFollow && hasNewNodes) {
      // Incremental update — pan to the newest node
      const lastNode = nodes[nodes.length - 1];
      if (lastNode && lastNode.position) {
        const nodeWidth = lastNode.measured?.width ?? lastNode.width ?? 200;
        const nodeHeight = lastNode.measured?.height ?? lastNode.height ?? 80;
        const x = lastNode.position.x + nodeWidth / 2;
        const y = lastNode.position.y + nodeHeight / 2;
        const currentZoom = getZoom();
        setTimeout(() => {
          setCenter(x, y, { duration: 400, zoom: currentZoom });
        }, 100);
      }
    }

    prevNodeCount.current = nodes.length;
  }, [nodes.length, autoFollow, fitView, setCenter, getZoom]);

  // Center-on-demand: triggered by toggleAutoFollow(ON) or Recenter button
  useEffect(() => {
    if (!centerRequested || nodes.length === 0) return;

    const lastNode = nodes[nodes.length - 1];
    if (lastNode && lastNode.position) {
      const nodeWidth = lastNode.measured?.width ?? lastNode.width ?? 200;
      const nodeHeight = lastNode.measured?.height ?? lastNode.height ?? 80;
      const x = lastNode.position.x + nodeWidth / 2;
      const y = lastNode.position.y + nodeHeight / 2;
      setTimeout(() => {
        setCenter(x, y, { duration: 400, zoom: 1 });
      }, 100);
    }

    clearCenterRequest();
  }, [centerRequested, nodes, setCenter, getZoom, clearCenterRequest]);

  // Center on first node: triggered by Start button
  useEffect(() => {
    if (!centerStartRequested || nodes.length === 0) return;

    const firstNode = nodes[0];
    if (firstNode && firstNode.position) {
      const nodeWidth = firstNode.measured?.width ?? firstNode.width ?? 200;
      const nodeHeight = firstNode.measured?.height ?? firstNode.height ?? 80;
      const x = firstNode.position.x + nodeWidth / 2;
      const y = firstNode.position.y + nodeHeight / 2;
      setTimeout(() => {
        setCenter(x, y, { duration: 400, zoom: 1 });
      }, 100);
    }

    clearCenterRequest();
  }, [centerStartRequested, nodes, setCenter, clearCenterRequest]);

  // Clear isNew flags after animation
  useEffect(() => {
    if (newNodeIds.size > 0) {
      const timer = setTimeout(clearNewNodes, 1500);
      return () => clearTimeout(timer);
    }
  }, [newNodeIds, clearNewNodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

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
    const pad = 800;
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
      fitView
      translateExtent={translateExtent}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ animated: false }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#1a1a2e" gap={20} size={1} />
      <Controls />
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
        style={{ backgroundColor: '#0d0d14' }}
        maskColor="rgba(10, 10, 15, 0.7)"
        pannable
      />
    </ReactFlow>
  );
}
