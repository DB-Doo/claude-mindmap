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
      peekSessionActivity: (filePaths: string[]) => Promise<{ filePath: string; tailMessages: any[]; lastUserPrompt: string | null; fileMtime: number }[]>;
      watchSecondarySession: (filePath: string) => Promise<any[]>;
      stopSecondaryWatching: () => Promise<void>;
      onSecondaryNewMessages: (cb: (messages: any[]) => void) => () => void;
    };
  }
}

/** Extract the last real user prompt from a list of messages. */
function findLastUserPrompt(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'user') continue;
    const content = msg.message?.content;
    if (content == null) continue;
    if (typeof content === 'string') {
      const trimmed = content.trimStart();
      if (trimmed.startsWith('<task-notification>') || trimmed.startsWith('<system-reminder>')) continue;
      return content.length > 80 ? content.slice(0, 77) + '\u2026' : content;
    }
    if (Array.isArray(content)) {
      const hasOnlyToolResults = content.length > 0 && content.every((b: any) => b.type === 'tool_result');
      if (hasOnlyToolResults) continue;
      const textParts = content.filter((b: any) => b.type === 'text' && b.text?.trim()).map((b: any) => b.text);
      if (textParts.length === 0) continue;
      const text = textParts.join(' ');
      return text.length > 80 ? text.slice(0, 77) + '\u2026' : text;
    }
  }
  return null;
}

/** Extract the latest assistant text snippet from a list of messages. */
function findLastAssistantText(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type !== 'assistant') continue;
    const content = msg.message?.content;
    if (!Array.isArray(content)) continue;
    // Walk content blocks in reverse to find the latest text
    for (let j = content.length - 1; j >= 0; j--) {
      if (content[j].type === 'text' && content[j].text?.trim()) {
        const text = content[j].text.trim();
        return text.length > 60 ? text.slice(0, 57) + '\u2026' : text;
      }
    }
  }
  return null;
}

// Module-level counters so only the latest request wins,
// even across StrictMode double-invocations.
let primaryRequestGen = 0;
let secondaryRequestGen = 0;

export function useSessionWatcher(): void {
  const setSessions = useSessionStore((s) => s.setSessions);
  const setMessages = useSessionStore((s) => s.setMessages);
  const appendMessages = useSessionStore((s) => s.appendMessages);
  const primarySessionPath = useSessionStore((s) => s.panes.primary.sessionPath);
  const secondarySessionPath = useSessionStore((s) => s.panes.secondary.sessionPath);
  const sessions = useSessionStore((s) => s.sessions);
  const setBackgroundActivities = useSessionStore((s) => s.setBackgroundActivities);

  const appendRef = useRef(appendMessages);
  appendRef.current = appendMessages;

  // Primary pane: batched append
  const pendingRef = useRef<JSONLMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    timerRef.current = null;
    if (pendingRef.current.length > 0) {
      const batch = pendingRef.current;
      pendingRef.current = [];
      appendRef.current('primary', batch);
    }
  }, []);

  // Secondary pane: batched append
  const secondaryPendingRef = useRef<JSONLMessage[]>([]);
  const secondaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSecondaryPending = useCallback(() => {
    secondaryTimerRef.current = null;
    if (secondaryPendingRef.current.length > 0) {
      const batch = secondaryPendingRef.current;
      secondaryPendingRef.current = [];
      appendRef.current('secondary', batch);
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

  // When primarySessionPath changes: load the full session.
  useEffect(() => {
    if (!primarySessionPath) return;

    // Clear any pending batched messages from previous session
    pendingRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const gen = ++primaryRequestGen;

    window.api.watchSession(primarySessionPath)
      .then((messages) => {
        if (gen !== primaryRequestGen) return;

        if (messages.length > 0) {
          setMessages('primary', messages);
        } else {
          setTimeout(() => {
            if (gen !== primaryRequestGen) return;
            window.api.watchSession(primarySessionPath)
              .then((retryMessages) => {
                if (gen !== primaryRequestGen) return;
                setMessages('primary', retryMessages);
              })
              .catch(() => {});
          }, 500);
        }
      })
      .catch(() => {});
  }, [primarySessionPath, setMessages]);

  // Register the secondary-messages listener once for incremental updates.
  useEffect(() => {
    const unsub = window.api.onSecondaryNewMessages((msgs) => {
      secondaryPendingRef.current.push(...msgs);
      if (secondaryTimerRef.current) clearTimeout(secondaryTimerRef.current);
      secondaryTimerRef.current = setTimeout(flushSecondaryPending, 100);
    });
    return () => {
      unsub();
      if (secondaryTimerRef.current) {
        clearTimeout(secondaryTimerRef.current);
        flushSecondaryPending();
      }
    };
  }, [flushSecondaryPending]);

  // When secondarySessionPath changes: load the full session.
  useEffect(() => {
    if (!secondarySessionPath) {
      window.api.stopSecondaryWatching();
      return;
    }

    secondaryPendingRef.current = [];
    if (secondaryTimerRef.current) {
      clearTimeout(secondaryTimerRef.current);
      secondaryTimerRef.current = null;
    }

    const gen = ++secondaryRequestGen;

    window.api.watchSecondarySession(secondarySessionPath)
      .then((messages) => {
        if (gen !== secondaryRequestGen) return;
        setMessages('secondary', messages);
      })
      .catch(() => {});

    return () => {
      window.api.stopSecondaryWatching();
    };
  }, [secondarySessionPath, setMessages]);

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
        const map = new Map<string, { activity: any; detail?: string; sessionName: string; lastReply?: string }>();
        const storeState = useSessionStore.getState();
        const currentPath = storeState.panes.primary.sessionPath;
        for (const r of results) {
          const isCurrent = r.filePath === currentPath;
          // For current session, use full rawMessages (always complete).
          // For background sessions, use lastUserPrompt from main process
          // (scans up to 512KB to handle image-heavy messages).
          const msgs = isCurrent && storeState.panes.primary.rawMessages.length > 0
            ? storeState.panes.primary.rawMessages
            : r.tailMessages;
          const { activity, detail } = detectActivity(r.tailMessages, true, r.fileMtime);
          const lastPrompt = isCurrent
            ? findLastUserPrompt(storeState.panes.primary.rawMessages)
            : r.lastUserPrompt;
          const lastReply = findLastAssistantText(msgs);
          const session = sessions.find((s) => s.filePath === r.filePath);
          const fallback = session?.displayText || session?.sessionId || 'Session';
          map.set(r.filePath, { activity, detail, sessionName: lastPrompt || fallback, lastReply: lastReply || undefined });
        }
        setBackgroundActivities(map);
      }).catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessions, primarySessionPath, setBackgroundActivities]);
}
