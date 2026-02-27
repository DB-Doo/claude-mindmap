import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
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
