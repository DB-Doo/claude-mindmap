import { ReactFlowProvider } from '@xyflow/react';
import MindMap from './components/MindMap';
import SessionPicker from './components/SessionPicker';
import Toolbar, { PaneToolbar } from './components/Toolbar';
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
  const focusedPane = useSessionStore((s) => s.focusedPane);

  const primaryFocused = splitMode && focusedPane === 'primary';
  const secondaryFocused = splitMode && focusedPane === 'secondary';

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <SessionPicker />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Toolbar />
        {/* Split mode: both pane toolbars in one shared row, guaranteed aligned */}
        {splitMode && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            <PaneToolbar paneId="primary" />
            <div style={{ width: 6, flexShrink: 0 }} />
            <PaneToolbar paneId="secondary" />
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Primary pane */}
          <ReactFlowProvider>
            <div style={{
              flex: 1,
              position: 'relative',
              minWidth: 0,
              outline: primaryFocused ? '2px solid #a855f740' : 'none',
              outlineOffset: -2,
              transition: 'outline-color 0.2s',
            }}>
              <MindMap />
              <ThinkingIndicator />
              <LiveStatusBar paneId="primary" />
            </div>
          </ReactFlowProvider>
          {/* Secondary pane (split mode only) */}
          {splitMode && (
            <>
              <SplitResizeHandle />
              <div style={{
                flex: 1,
                display: 'flex',
                minWidth: 0,
                outline: secondaryFocused ? '2px solid #a855f740' : 'none',
                outlineOffset: -2,
                transition: 'outline-color 0.2s',
              }}>
                <SecondaryPane />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
