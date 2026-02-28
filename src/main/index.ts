import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { discoverSessions } from './session-discovery';
import { SessionWatcher } from './watcher';

// Prevent EPIPE crashes when stdout pipe is closed (e.g. terminal exits)
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

let mainWindow: BrowserWindow | null = null;
let currentWatcher: SessionWatcher | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle('discover-sessions', async () => {
  return discoverSessions();
});

ipcMain.handle('watch-session', async (_event, filePath: string) => {
  // Tear down any existing watcher before creating a new one.
  if (currentWatcher) {
    currentWatcher.stop();
    currentWatcher = null;
  }

  try {
    const watcher = new SessionWatcher(filePath);
    currentWatcher = watcher;

    watcher.on('new-messages', (messages) => {
      if (currentWatcher !== watcher) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('new-messages', messages);
      }
    });

    watcher.on('error', () => {});

    const initialMessages = watcher.start();
    return initialMessages;
  } catch {
    return [];
  }
});

ipcMain.handle('stop-watching', async () => {
  if (currentWatcher) {
    currentWatcher.stop();
    currentWatcher = null;
  }
});

/** Find the last real user prompt by scanning backward through JSONL lines. */
function findLastUserPromptFromLines(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    let msg: any;
    try { msg = JSON.parse(lines[i]); } catch { continue; }
    if (msg.type !== 'user') continue;
    const content = msg.message?.content;
    if (content == null) continue;
    if (typeof content === 'string') {
      const trimmed = content.trimStart();
      if (trimmed.startsWith('<task-notification>') || trimmed.startsWith('<system-reminder>')) continue;
      return content.length > 80 ? content.slice(0, 77) + '\u2026' : content;
    }
    if (Array.isArray(content)) {
      if (content.length > 0 && content.every((b: any) => b.type === 'tool_result')) continue;
      const textParts = content.filter((b: any) => b.type === 'text' && b.text?.trim()).map((b: any) => b.text);
      if (textParts.length === 0) continue;
      const text = textParts.join(' ');
      return text.length > 80 ? text.slice(0, 77) + '\u2026' : text;
    }
  }
  return null;
}

ipcMain.handle('peek-session-activity', async (_event, filePaths: string[]) => {
  return filePaths.map((fp) => {
    try {
      const stat = fs.statSync(fp);
      if (stat.size === 0) return { filePath: fp, tailMessages: [], lastUserPrompt: null };
      const fd = fs.openSync(fp, 'r');

      // Small tail (64KB / 50 msgs) for activity detection
      const tailSize = Math.min(65536, stat.size);
      const tailBuf = Buffer.alloc(tailSize);
      fs.readSync(fd, tailBuf, 0, tailSize, stat.size - tailSize);
      const tailText = tailBuf.toString('utf8');
      const tailLines = tailText.split('\n').filter((l) => l.trim());
      const messages: any[] = [];
      for (let i = tailLines.length - 1; i >= 0 && messages.length < 50; i--) {
        try { messages.unshift(JSON.parse(tailLines[i])); } catch { /* skip */ }
      }

      // Try finding user prompt in the small tail first
      let lastUserPrompt = findLastUserPromptFromLines(tailLines);

      // If not found (image messages can be 100KB+ each), read a larger chunk
      if (!lastUserPrompt && stat.size > tailSize) {
        const bigSize = Math.min(524288, stat.size); // 512KB
        const bigBuf = Buffer.alloc(bigSize);
        fs.readSync(fd, bigBuf, 0, bigSize, stat.size - bigSize);
        const bigLines = bigBuf.toString('utf8').split('\n').filter((l) => l.trim());
        lastUserPrompt = findLastUserPromptFromLines(bigLines);
      }

      fs.closeSync(fd);
      return { filePath: fp, tailMessages: messages, lastUserPrompt };
    } catch {
      return { filePath: fp, tailMessages: [], lastUserPrompt: null };
    }
  });
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows exist.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up the file watcher before quitting.
  if (currentWatcher) {
    currentWatcher.stop();
    currentWatcher = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
