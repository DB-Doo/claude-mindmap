import { contextBridge, ipcRenderer } from 'electron';
import { JSONLMessage, SessionInfo } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  /** Discover all available sessions from ~/.claude/history.jsonl */
  discoverSessions: (): Promise<SessionInfo[]> =>
    ipcRenderer.invoke('discover-sessions'),

  /** Start watching a session JSONL file. Returns all existing messages immediately. */
  watchSession: (filePath: string): Promise<JSONLMessage[]> =>
    ipcRenderer.invoke('watch-session', filePath),

  /** Stop the current file watcher */
  stopWatching: (): Promise<void> =>
    ipcRenderer.invoke('stop-watching'),

  /** Peek at the tail of multiple session files to detect background activity */
  peekSessionActivity: (filePaths: string[]): Promise<{ filePath: string; tailMessages: JSONLMessage[]; lastUserPrompt: string | null; fileMtime: number }[]> =>
    ipcRenderer.invoke('peek-session-activity', filePaths),

  /** Register a callback for incrementally-appended messages */
  onNewMessages: (callback: (messages: JSONLMessage[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, messages: JSONLMessage[]) =>
      callback(messages);
    ipcRenderer.on('new-messages', handler);
    return () => {
      ipcRenderer.removeListener('new-messages', handler);
    };
  },

  /** Start watching a secondary session (split view) */
  watchSecondarySession: (filePath: string): Promise<JSONLMessage[]> =>
    ipcRenderer.invoke('watch-secondary-session', filePath),

  /** Stop the secondary file watcher */
  stopSecondaryWatching: (): Promise<void> =>
    ipcRenderer.invoke('stop-secondary-watching'),

  /** Register a callback for secondary session incremental messages */
  onSecondaryNewMessages: (callback: (messages: JSONLMessage[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, messages: JSONLMessage[]) =>
      callback(messages);
    ipcRenderer.on('secondary-new-messages', handler);
    return () => {
      ipcRenderer.removeListener('secondary-new-messages', handler);
    };
  },
});
