import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { discoverSessions } from './session-discovery';
import { SessionWatcher } from './watcher';

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

  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[R]', message);
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
  console.log('[IPC] watch-session:', filePath);

  // Tear down any existing watcher before creating a new one.
  if (currentWatcher) {
    console.log('[IPC] stopping previous watcher');
    currentWatcher.stop();
    currentWatcher = null;
  }

  try {
    const watcher = new SessionWatcher(filePath);
    currentWatcher = watcher;

    watcher.on('new-messages', (messages) => {
      if (currentWatcher !== watcher) return;
      console.log('[IPC] sending new-messages:', messages.length, 'messages');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('new-messages', messages);
      }
    });

    watcher.on('error', (err: unknown) => {
      console.error('[SessionWatcher] error:', err);
    });

    // start() reads the file and returns all existing messages synchronously,
    // then begins watching for future changes. We return the initial messages
    // as the invoke result so the renderer gets them immediately.
    const initialMessages = watcher.start();
    console.log('[IPC] returning initial-messages:', initialMessages.length, 'messages');
    return initialMessages;
  } catch (err) {
    console.error('[IPC] watch-session error:', err);
    return [];
  }
});

ipcMain.handle('stop-watching', async () => {
  if (currentWatcher) {
    console.log('[IPC] stop-watching');
    currentWatcher.stop();
    currentWatcher = null;
  }
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
