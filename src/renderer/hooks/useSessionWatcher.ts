import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore, detectActivity } from '../store/session-store';
import { SessionInfo, JSONLMessage } from '../../shared/types';

declare global {
  interface Window {
    api: {
      discoverSessions: () => Promise<SessionInfo[]>;
      watchSession: (filePath: string) => Promise<any[]>;
      stopWatching: () => Promise<void>;
      onNewMessages: (cb: (messages: any[]) => void) => () => void;
      peekSessionActivity: (filePaths: string[]) => Promise<{ filePath: string; tailMessages: any[] }[]>;
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
  const sessions = useSessionStore((s) => s.sessions);
  const setBackgroundActivities = useSessionStore((s) => s.setBackgroundActivities);

  const appendRef = useRef(appendMessages);
  appendRef.current = appendMessages;

  // Batched append: buffer incoming messages, flush after 100ms idle
  const pendingRef = useRef<JSONLMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    timerRef.current = null;
    if (pendingRef.current.length > 0) {
      const batch = pendingRef.current;
      pendingRef.current = [];
      appendRef.current(batch);
    }
  }, []);

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
  // Uses batched append to avoid multiple fullRebuilds per second.
  useEffect(() => {
    const unsub = window.api.onNewMessages((msgs) => {
      pendingRef.current.push(...msgs);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushPending, 100);
    });
    return () => {
      unsub();
      // Flush any pending messages on cleanup
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flushPending();
      }
    };
  }, [flushPending]);

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

    // Clear any pending batched messages from previous session
    pendingRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

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
              .catch(() => {});
          }, 500);
        }
      })
      .catch(() => {});
  }, [activeSessionPath, setMessages]);

  // Poll background sessions for activity every 3 seconds
  useEffect(() => {
    const poll = () => {
      const activePaths = sessions
        .filter((s) => s.endReason === 'active')
        .map((s) => s.filePath);

      if (activePaths.length === 0) {
        setBackgroundActivities(new Map());
        return;
      }

      window.api.peekSessionActivity(activePaths).then((results) => {
        const map = new Map<string, { activity: any; detail?: string; sessionName: string }>();
        for (const r of results) {
          const { activity, detail } = detectActivity(r.tailMessages);
          const session = sessions.find((s) => s.filePath === r.filePath);
          const name = session?.displayText || session?.sessionId || 'Session';
          map.set(r.filePath, { activity, detail, sessionName: name });
        }
        setBackgroundActivities(map);
      }).catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessions, activeSessionPath, setBackgroundActivities]);
}
