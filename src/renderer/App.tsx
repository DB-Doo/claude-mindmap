import { ReactFlowProvider } from '@xyflow/react';
import MindMap from './components/MindMap';
import SessionPicker from './components/SessionPicker';
import Toolbar from './components/Toolbar';
import NodeDetails from './components/NodeDetails';
import ThinkingIndicator from './components/ThinkingIndicator';
import { useSessionWatcher } from './hooks/useSessionWatcher';
import './styles/globals.css';
import './styles/nodes.css';
import './styles/edges.css';

export default function App() {
  useSessionWatcher();

  return (
    <ReactFlowProvider>
      <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
        <SessionPicker />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Toolbar />
          <div style={{ flex: 1, position: 'relative' }}>
            <MindMap />
            <ThinkingIndicator />
          </div>
        </div>
        <NodeDetails />
      </div>
    </ReactFlowProvider>
  );
}
