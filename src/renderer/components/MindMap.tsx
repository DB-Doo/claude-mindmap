import { useCallback, useEffect, useRef } from 'react';
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
};

const edgeTypes = {
  neonEdge: NeonEdge,
};

export default function MindMap() {
  const graphNodes = useSessionStore(s => s.nodes);
  const graphEdges = useSessionStore(s => s.edges);
  const direction = useSessionStore(s => s.layoutDirection);
  const selectNode = useSessionStore(s => s.selectNode);
  const autoFollow = useSessionStore(s => s.autoFollow);
  const newNodeIds = useSessionStore(s => s.newNodeIds);
  const clearNewNodes = useSessionStore(s => s.clearNewNodes);

  const { nodes, edges } = useAutoLayout(graphNodes, graphEdges, direction);
  const { setCenter, getZoom } = useReactFlow();
  const prevNodeCount = useRef(0);

  // Auto-follow: pan to the newest node when new nodes appear,
  // keeping the current zoom level instead of zooming out to fit all.
  useEffect(() => {
    if (autoFollow && nodes.length > prevNodeCount.current && nodes.length > 0) {
      // Find the last node (newest, since they're ordered by creation)
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
  }, [nodes.length, autoFollow, setCenter, getZoom]);

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
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
          return '#333';
        }}
        maskColor="rgba(10, 10, 15, 0.8)"
      />
    </ReactFlow>
  );
}
