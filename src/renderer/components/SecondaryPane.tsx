import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
} from '@xyflow/react';
import ToolNode from '../nodes/ToolNode';
import UserNode from '../nodes/UserNode';
import ThinkingNode from '../nodes/ThinkingNode';
import TextNode from '../nodes/TextNode';
import SystemNode from '../nodes/SystemNode';
import CompactionNode from '../nodes/CompactionNode';
import SessionEndNode from '../nodes/SessionEndNode';
import NeonEdge from '../edges/NeonEdge';
import { useSessionStore, detectActivity, type LiveActivity } from '../store/session-store';
import { buildGraph } from '../store/graph-builder';
import { useAutoLayout } from '../hooks/useAutoLayout';
import { TOOL_COLORS, type GraphNode, type GraphEdge } from '../../shared/types';

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

const ACTIVITY_COLORS: Record<LiveActivity, string> = {
  idle: '#475569',
  thinking: '#a855f7',
  tool_running: '#ff6b35',
  responding: '#00d4ff',
  waiting_on_user: '#34d399',
  compacting: '#fbbf24',
};

const ACTIVITY_LABELS: Record<LiveActivity, string> = {
  idle: 'Active',
  thinking: 'Thinking',
  tool_running: 'Running tool',
  responding: 'Responding',
  waiting_on_user: 'Waiting',
  compacting: 'Compacting',
};

// ─── Secondary Header ─────────────────────────────────────────────────

function SecondaryHeader({
  sessionName,
  activity,
  onSwap,
}: {
  sessionName: string;
  activity: LiveActivity;
  onSwap: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sessions = useSessionStore((s) => s.sessions);
  const setSecondarySession = useSessionStore((s) => s.setSecondarySession);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const actColor = ACTIVITY_COLORS[activity];

  return (
    <div style={{
      height: 32,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 8px',
      backgroundColor: '#12121a',
      borderBottom: '1px solid #2a2a3e',
      fontSize: 11,
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Activity dot */}
      {activity !== 'idle' && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: actColor,
          boxShadow: `0 0 6px ${actColor}80`,
          flexShrink: 0,
        }} />
      )}
      {/* Session name / dropdown toggle */}
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          color: '#e0e0e0',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '2px 4px',
          borderRadius: 3,
        }}
      >
        {sessionName} <span style={{ color: '#475569', fontSize: 9 }}>{'\u25BE'}</span>
      </button>
      {/* Swap button */}
      <button
        onClick={onSwap}
        title="Promote to primary pane"
        style={{
          background: 'none',
          border: '1px solid #2a2a3e',
          color: '#888',
          fontSize: 12,
          cursor: 'pointer',
          borderRadius: 4,
          padding: '1px 6px',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#e0e0e0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.color = '#888'; }}
      >
        {'\u21C4'}
      </button>
      {/* Dropdown session picker */}
      {pickerOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            right: 0,
            maxHeight: 300,
            overflowY: 'auto',
            backgroundColor: '#12121a',
            border: '1px solid #2a2a3e',
            borderRadius: '0 0 6px 6px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {sessions
            .filter((s) => s.filePath !== activeSessionPath)
            .map((s) => {
              const lastPrompt = s.userPrompts?.length
                ? s.userPrompts[s.userPrompts.length - 1]
                : s.subtitle || s.displayText;
              return (
                <div
                  key={s.sessionId}
                  onClick={() => {
                    setSecondarySession(s.filePath);
                    setPickerOpen(false);
                  }}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #1a1a2e',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a2e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2,
                  }}>
                    {s.endReason === 'active' && (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#34d399',
                        boxShadow: '0 0 4px #34d39980',
                        flexShrink: 0,
                      }} />
                    )}
                    <span style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.displayText}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: s.endReason === 'active' ? 12 : 0 }}>
                    {lastPrompt}
                  </div>
                </div>
              );
            })}
          {sessions.filter((s) => s.filePath !== activeSessionPath).length === 0 && (
            <div style={{ padding: 12, fontSize: 10, color: '#475569', textAlign: 'center' }}>
              No other sessions
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity Badge ───────────────────────────────────────────────────

function ActivityBadge({ activity, detail }: { activity: LiveActivity; detail?: string }) {
  if (activity === 'idle' || activity === 'waiting_on_user') return null;
  const color = ACTIVITY_COLORS[activity];
  const label = activity === 'tool_running' && detail ? `Running ${detail}` : ACTIVITY_LABELS[activity];

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '3px 10px',
      background: 'rgba(10, 10, 15, 0.92)',
      border: `1px solid ${color}40`,
      borderRadius: 6,
      fontSize: 10,
      color,
      fontFamily: 'var(--font-mono, monospace)',
      fontWeight: 600,
      zIndex: 10,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────

function EmptySecondary() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const setSecondarySession = useSessionStore((s) => s.setSecondarySession);
  const otherSessions = sessions.filter((s) => s.filePath !== activeSessionPath);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: '#475569',
      fontSize: 12,
      borderLeft: '2px solid #2a2a3e',
      backgroundColor: '#0a0a0f',
      minWidth: 300,
    }}>
      <span style={{ fontSize: 24 }}>{'\u2B50'}</span>
      <span>Select a session for the secondary pane</span>
      {otherSessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {otherSessions.slice(0, 8).map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setSecondarySession(s.filePath)}
              style={{
                background: 'rgba(168, 85, 247, 0.05)',
                border: '1px solid #2a2a3e',
                borderRadius: 4,
                color: '#94a3b8',
                fontSize: 10,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#e0e0e0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.color = '#94a3b8'; }}
            >
              {s.endReason === 'active' ? '\uD83D\uDFE2 ' : ''}{s.displayText}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inner Canvas (needs ReactFlowProvider above it) ──────────────────

function SecondaryCanvas() {
  const secondarySessionPath = useSessionStore((s) => s.secondarySessionPath);
  const sessions = useSessionStore((s) => s.sessions);
  const swapPanes = useSessionStore((s) => s.swapPanes);

  const [messages, setMessages] = useState<any[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [activity, setActivity] = useState<LiveActivity>('idle');
  const [activityDetail, setActivityDetail] = useState<string | undefined>();
  const messagesRef = useRef<any[]>([]);
  const genRef = useRef(0);
  const { fitView } = useReactFlow();

  // Load messages when secondarySessionPath changes
  useEffect(() => {
    if (!secondarySessionPath) {
      setMessages([]);
      setGraphNodes([]);
      setGraphEdges([]);
      setActivity('idle');
      return;
    }

    const gen = ++genRef.current;
    messagesRef.current = [];

    window.api.watchSecondarySession(secondarySessionPath).then((msgs) => {
      if (gen !== genRef.current) return;
      messagesRef.current = msgs;
      setMessages(msgs);
      const { nodes, edges } = buildGraph(msgs);
      setGraphNodes(nodes);
      setGraphEdges(edges);

      const isActive = sessions.some((s) => s.filePath === secondarySessionPath && s.endReason === 'active');
      const info = detectActivity(msgs, isActive);
      setActivity(info.activity);
      setActivityDetail(info.detail);

      // Fit view after initial load
      setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 100);
    });

    const unsub = window.api.onSecondaryNewMessages((newMsgs) => {
      if (gen !== genRef.current) return;
      const combined = [...messagesRef.current, ...newMsgs];
      messagesRef.current = combined;
      setMessages(combined);
      const { nodes, edges } = buildGraph(combined);
      setGraphNodes(nodes);
      setGraphEdges(edges);

      const isActive = sessions.some((s) => s.filePath === secondarySessionPath && s.endReason === 'active');
      const info = detectActivity(combined, isActive);
      setActivity(info.activity);
      setActivityDetail(info.detail);
    });

    return () => {
      unsub();
      window.api.stopSecondaryWatching();
    };
  }, [secondarySessionPath, sessions, fitView]);

  const layoutResult = useAutoLayout(graphNodes, graphEdges);

  const sessionInfo = sessions.find((s) => s.filePath === secondarySessionPath);
  const sessionName = sessionInfo?.displayText || 'Secondary';

  const onPaneClick = useCallback(() => {
    swapPanes();
  }, [swapPanes]);

  const borderColor = activity !== 'idle' && activity !== 'waiting_on_user'
    ? ACTIVITY_COLORS[activity]
    : '#2a2a3e';

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 300,
      borderLeft: `2px solid ${borderColor}`,
      transition: 'border-color 0.3s',
    }}>
      <SecondaryHeader
        sessionName={sessionName}
        activity={activity}
        onSwap={swapPanes}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={layoutResult.nodes}
          edges={layoutResult.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ animated: false }}
          proOptions={{ hideAttribution: true }}
          onPaneClick={onPaneClick}
        >
          <Background color="#1a1a2e" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            style={{
              backgroundColor: '#0d0d14',
              width: 120,
              height: 80,
            }}
            maskColor="rgba(10, 10, 15, 0.7)"
            pannable
            nodeColor={(n) => {
              const gn = n.data as any;
              if (gn?.kind === 'user') return '#34d399';
              if (gn?.kind === 'tool_use') return TOOL_COLORS[gn.toolName] || '#6b7280';
              if (gn?.kind === 'thinking') return '#a855f7';
              if (gn?.kind === 'text') return '#6b7280';
              if (gn?.kind === 'compaction') return '#fbbf24';
              return '#475569';
            }}
          />
        </ReactFlow>
        <ActivityBadge activity={activity} detail={activityDetail} />
      </div>
    </div>
  );
}

// ─── Main SecondaryPane (wraps with its own ReactFlowProvider) ─────────

export default function SecondaryPane() {
  const secondarySessionPath = useSessionStore((s) => s.secondarySessionPath);

  if (!secondarySessionPath) {
    return <EmptySecondary />;
  }

  return (
    <ReactFlowProvider>
      <SecondaryCanvas />
    </ReactFlowProvider>
  );
}
