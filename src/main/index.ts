import * as path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerJobHandlers } from './ipc/jobHandlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, 'preload.js');

  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f6f9fc',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../../renderer/index.html');
    void window.loadFile(indexPath);
  }

  return window;
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  registerJobHandlers(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
