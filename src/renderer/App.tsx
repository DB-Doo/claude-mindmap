import MindMap from './components/MindMap';
import SessionPicker from './components/SessionPicker';
import Toolbar from './components/Toolbar';
import ThinkingIndicator from './components/ThinkingIndicator';
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
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Primary pane */}
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
          </div>
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
