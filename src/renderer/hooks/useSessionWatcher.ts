import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/session-store';
import { SessionInfo } from '../../shared/types';

declare global {
  interface Window {
    api: {
      discoverSessions: () => Promise<SessionInfo[]>;
      watchSession: (filePath: string) => Promise<any[]>;
      stopWatching: () => Promise<void>;
      onNewMessages: (cb: (messages: any[]) => void) => () => void;
    };
  }
}

// Module-level counter so only the latest request wins,
// even across StrictMode double-invocations.
let requestGeneration = 0;

export function useSessionWatcher(): void {
  const setSessions = useSessionStore((s) => s.setSessions);
  const setMessages = useSessionStore((s) => s.setMessages);
  const appendMessages = useSessionStore((s) => s.appendMessages);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);

  const appendRef = useRef(appendMessages);
  appendRef.current = appendMessages;

  // On mount: discover sessions, and periodically re-discover (every 30s)
  // so endReason updates from 'active' → 'ended' without manual refresh.
  useEffect(() => {
    window.api.discoverSessions().then(setSessions);
    const interval = setInterval(() => {
      window.api.discoverSessions().then(setSessions);
    }, 30_000);
    return () => clearInterval(interval);
  }, [setSessions]);

  // Register the new-messages listener once for incremental updates.
  useEffect(() => {
    const unsub = window.api.onNewMessages((msgs) => {
      appendRef.current(msgs);
    });
    return () => unsub();
  }, []);

  // When activeSessionPath changes: load the full session.
  //
  // IMPORTANT: No stopWatching() in the cleanup! The main process
  // watch-session handler already stops any previous watcher before
  // creating a new one. Calling stopWatching here caused a race
  // condition with React StrictMode (which double-fires effects):
  //   mount1: watchSession → cleanup: stopWatching → mount2: watchSession
  // The stopWatching between the two watchSession calls could interfere
  // with the second watcher's setup. Removing it eliminates the race.
  useEffect(() => {
    if (!activeSessionPath) return;

    const gen = ++requestGeneration;

    window.api.watchSession(activeSessionPath)
      .then((messages) => {
        if (gen !== requestGeneration) return; // stale

        if (messages.length > 0) {
          setMessages(messages);
        } else {
          // File might have been briefly locked (Windows) or unreadable.
          // Retry once after a short delay.
          setTimeout(() => {
            if (gen !== requestGeneration) return; // stale after delay
            window.api.watchSession(activeSessionPath)
              .then((retryMessages) => {
                if (gen !== requestGeneration) return;
                setMessages(retryMessages);
              })
              .catch((err) => {
                console.error('[renderer] watchSession retry failed:', err);
              });
          }, 500);
        }
      })
      .catch((err) => {
        console.error('[renderer] watchSession failed:', err);
      });
  }, [activeSessionPath, setMessages]);
}
