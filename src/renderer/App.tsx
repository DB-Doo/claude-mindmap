import { ReactFlowProvider } from '@xyflow/react';
import MindMap from './components/MindMap';
import Toolbar from './components/Toolbar';
import NodeDetails from './components/NodeDetails';
import ThinkingIndicator from './components/ThinkingIndicator';
import LiveStatusBar from './components/LiveStatusBar';
import SecondaryPane from './components/SecondaryPane';
import SplitResizeHandle from './components/SplitResizeHandle';
import { useSessionWatcher } from './hooks/useSessionWatcher';
import { useSessionStore } from './store/session-store';
import './styles/globals.css';
import './styles/nodes.css';
import './styles/edges.css';

export default function App() {
  useSessionWatcher();
  const splitMode = useSessionStore((s) => s.splitMode);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Toolbar />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Primary pane */}
          <ReactFlowProvider>
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <MindMap />
              <ThinkingIndicator />
              <LiveStatusBar />
            </div>
          </ReactFlowProvider>
          {/* Secondary pane (split mode only) */}
          {splitMode && (
            <>
              <SplitResizeHandle />
              <SecondaryPane />
            </>
          )}
        </div>
      </div>
      <NodeDetails />
    </div>
  );
}
