import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { SessionInfo, SessionEndReason } from '../shared/types';

interface HistoryEntry {
  display: string;
  pastedContents?: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}

/**
 * Represents a .claude directory we can scan for sessions.
 * Each environment (Windows native, WSL distro) has its own.
 */
interface ClaudeRoot {
  claudeDir: string;      // Absolute path to the .claude directory
  historyPath: string;    // Path to history.jsonl inside it
  label: string;          // Human-readable label (e.g. "Windows", "WSL/Ubuntu")
}

/**
 * Encode a project directory path into the folder-name format Claude uses
 * under ~/.claude/projects/. Path separators and colons are replaced with
 * dashes (e.g. "C:\Users\fderr" -> "C--Users-fderr",
 *              "/home/fderr" -> "-home-fderr").
 */
function encodeProjectDir(projectPath: string): string {
  return projectPath.replace(/[\\/]/g, '-').replace(/:/g, '-');
}

/**
 * Discover all .claude directories across Windows and WSL distros.
 *
 * Note: On Windows, we can't list \\wsl.localhost directly, but we can
 * access individual distros by name. We use `wsl -l -q` to discover
 * distro names, then probe each one for .claude directories.
 */
function findClaudeRoots(): ClaudeRoot[] {
  const roots: ClaudeRoot[] = [];

  // 1. Native Windows ~/.claude
  const windowsClaude = path.join(os.homedir(), '.claude');
  if (fs.existsSync(windowsClaude)) {
    roots.push({
      claudeDir: windowsClaude,
      historyPath: path.join(windowsClaude, 'history.jsonl'),
      label: 'Windows',
    });
  }

  // 2. WSL distros — use `wsl -l -q` to get names, then access via UNC path
  try {
    const output = execSync('wsl -l -q', { encoding: 'utf16le', timeout: 5000 });
    // wsl output uses UTF-16LE with \r\n and sometimes null bytes
    const distros = output
      .replace(/\0/g, '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('docker-'));

    for (const distro of distros) {
      try {
        // Use \\wsl.localhost\<distro> UNC path
        const distroRoot = `\\\\wsl.localhost\\${distro}\\home`;
        const users = fs.readdirSync(distroRoot);
        for (const user of users) {
          const wslClaude = path.join(distroRoot, user, '.claude');
          if (fs.existsSync(path.join(wslClaude, 'history.jsonl'))) {
            roots.push({
              claudeDir: wslClaude,
              historyPath: path.join(wslClaude, 'history.jsonl'),
              label: `WSL/${distro}`,
            });
          }
        }
      } catch {
        // Can't access this distro
      }
    }
  } catch {
    // WSL not available
  }

  return roots;
}

/** Paths that are too generic to use as a session title. */
const GENERIC_DIR_NAMES = new Set(['home', 'projects', 'Users', 'mnt', 'c', 'tmp', 'var']);

function isGenericPath(dirPath: string): boolean {
  const name = path.basename(dirPath);
  if (GENERIC_DIR_NAMES.has(name)) return true;
  // Home directories: /home/<user>, C:\Users\<user>, /mnt/c/Users/<user>
  if (/^[/\\]home[/\\][^/\\]+$/.test(dirPath)) return true;
  if (/^[A-Z]:[/\\]Users[/\\][^/\\]+$/i.test(dirPath)) return true;
  if (/^[/\\]mnt[/\\][a-z][/\\]Users[/\\][^/\\]+$/i.test(dirPath)) return true;
  return false;
}

/** Convert "claude-discord-bot" -> "Claude Discord Bot" */
function prettifyDirName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface SessionMeta {
  firstMessage: string | null;
  projectName: string | null;
}

/**
 * Scan a JSONL session file to extract:
 * 1. The project name — derived from the most specific `cwd` directory
 *    that the session navigated to (e.g. "claude-mindmap" → "Claude Mindmap").
 * 2. The first user message — as a fallback title.
 */
function extractSessionMeta(filePath: string, sessionId: string, projectPath: string): SessionMeta {
  const result: SessionMeta = { firstMessage: null, projectName: null };

  try {
    const fd = fs.openSync(filePath, 'r');
    // Read up to 512KB to capture cwd changes that happen after initial setup
    const buf = Buffer.alloc(524288);
    const bytesRead = fs.readSync(fd, buf, 0, 524288, 0);
    fs.closeSync(fd);

    const text = buf.toString('utf8', 0, bytesRead);
    const lines = text.split('\n');

    // Track cwd occurrences to find the most-used project directory
    const cwdCounts = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);

        // Collect cwd values (from any message type)
        if (msg.cwd) {
          const cwd = msg.cwd as string;
          // Skip .claude internal paths and the base project path itself
          if (!cwd.includes('.claude') && cwd !== projectPath) {
            cwdCounts.set(cwd, (cwdCounts.get(cwd) || 0) + 1);
          }
        }

        // Extract first user message (same logic as before)
        if (!result.firstMessage && msg.type === 'user') {
          if (msg.sessionId && msg.sessionId !== sessionId) continue;
          if (msg.parentUuid !== null && msg.parentUuid !== undefined) continue;

          const content = msg.message?.content;
          if (typeof content === 'string' && content.trim().length > 0) {
            const t = content.trim();
            if (!t.startsWith('<local-command-caveat>') && !t.startsWith('[Request interrupted')) {
              result.firstMessage = t.slice(0, 120);
            }
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text?.trim()) {
                const t = block.text.trim();
                if (t.startsWith('[Request interrupted')) continue;
                if (t.startsWith('<local-command-caveat>')) continue;
                result.firstMessage = t.slice(0, 120);
                break;
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Find the best project name from cwds
    // Filter out generic paths, pick the most frequent remaining one
    let bestCwd = '';
    let bestCount = 0;
    for (const [cwd, count] of cwdCounts) {
      if (isGenericPath(cwd)) continue;
      if (count > bestCount) {
        bestCwd = cwd;
        bestCount = count;
      }
    }
    if (bestCwd) {
      result.projectName = prettifyDirName(path.basename(bestCwd));
    }
  } catch {
    // Ignore read errors
  }

  // If the project path itself is specific enough, use it as fallback
  if (!result.projectName && !isGenericPath(projectPath)) {
    result.projectName = prettifyDirName(path.basename(projectPath));
  }

  return result;
}

/**
 * Parse a history.jsonl file and return its entries keyed by sessionId.
 */
function parseHistoryFile(historyPath: string): Map<string, HistoryEntry> {
  const entryMap = new Map<string, HistoryEntry>();

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(historyPath, 'utf8');
  } catch {
    return entryMap;
  }

  const lines = rawContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const entry = JSON.parse(trimmed) as HistoryEntry;
      if (!entry.sessionId || !entry.project) continue;

      const existing = entryMap.get(entry.sessionId);
      if (!existing || entry.timestamp > existing.timestamp) {
        entryMap.set(entry.sessionId, entry);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entryMap;
}

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a session has a lock file, indicating it's currently running.
 * Claude Code creates .claude/tasks/<sessionId>/.lock while a session is active.
 */
function hasLockFile(sessionId: string, claudeDir: string): boolean {
  const lockPath = path.join(claudeDir, 'tasks', sessionId, '.lock');
  return fs.existsSync(lockPath);
}

/**
 * Detect how/why a session ended by reading the tail of the JSONL file.
 */
function detectEndReason(filePath: string, mtimeMs: number, sessionId: string, claudeDir: string): SessionEndReason {
  // Lock file present = definitely active
  if (hasLockFile(sessionId, claudeDir)) {
    return 'active';
  }

  // Still actively being written to?
  if (Date.now() - mtimeMs < ACTIVE_THRESHOLD_MS) {
    return 'active';
  }

  // Read the last ~8KB and check for compact_boundary
  try {
    const stat = fs.statSync(filePath);
    const tailSize = Math.min(8192, stat.size);
    const buf = Buffer.alloc(tailSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
    fs.closeSync(fd);

    const text = buf.toString('utf8');
    const lines = text.split('\n');

    // Walk backwards to find the last meaningful system message
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
          return 'compacted';
        }
      } catch {
        // partial line from seeking mid-line, skip
      }
    }
  } catch {
    // read error, fall through
  }

  return 'ended';
}

/**
 * Scan all discoverable .claude directories (Windows native + WSL distros)
 * and return metadata for every session whose JSONL log file exists.
 *
 * Returns sessions sorted by timestamp descending (newest first).
 * Deduplicates by sessionId, keeping the entry with the latest timestamp.
 */
export async function discoverSessions(): Promise<SessionInfo[]> {
  const roots = findClaudeRoots();

  // Collect all sessions across all roots, deduplicating by sessionId.
  const globalMap = new Map<string, { entry: HistoryEntry; claudeDir: string }>();

  for (const root of roots) {
    if (!fs.existsSync(root.historyPath)) continue;

    const entries = parseHistoryFile(root.historyPath);
    for (const [sessionId, entry] of entries) {
      const existing = globalMap.get(sessionId);
      if (!existing || entry.timestamp > existing.entry.timestamp) {
        globalMap.set(sessionId, { entry, claudeDir: root.claudeDir });
      }
    }
  }

  // Build SessionInfo[] for entries whose log files exist on disk.
  const sessions: SessionInfo[] = [];

  for (const { entry, claudeDir } of globalMap.values()) {
    const encodedProject = encodeProjectDir(entry.project);
    const logFile = path.join(
      claudeDir,
      'projects',
      encodedProject,
      `${entry.sessionId}.jsonl`,
    );

    let stat;
    try {
      stat = fs.statSync(logFile);
    } catch {
      continue;
    }

    const meta = extractSessionMeta(logFile, entry.sessionId, entry.project);
    const title = meta.projectName || meta.firstMessage || entry.display || '(no prompt)';
    // Show latest user prompt as subtitle (entry.display from history.jsonl
    // tracks the most recent prompt, while meta.firstMessage is the first one)
    const subtitle = meta.projectName
      ? (entry.display || meta.firstMessage || undefined)
      : undefined;
    const endReason = detectEndReason(logFile, stat.mtimeMs, entry.sessionId, claudeDir);
    sessions.push({
      sessionId: entry.sessionId,
      project: entry.project,
      displayText: title,
      subtitle,
      timestamp: new Date(entry.timestamp).toISOString(),
      filePath: logFile,
      lastModified: stat.mtimeMs,
      endReason,
    });
  }

  // Sort newest first
  sessions.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return sessions;
}
