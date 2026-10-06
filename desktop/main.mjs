import { app, BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let server, window;
if (!app.isPackaged) app.setPath('userData', path.join(root, 'desktop-data'));
app.setAppUserModelId('com.paperrockets.tokeneater');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show(); window?.focus();
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    server = await startServer({ port: 0, host: '127.0.0.1', dataPath: path.join(app.getPath('userData'), 'usage.json') });
    const origin = `http://127.0.0.1:${server.address().port}`;
    window = new BrowserWindow({
      title: 'Token Eater', width: 430, height: 740, minWidth: 360, minHeight: 650,
      icon: path.join(root, 'icon.ico'), backgroundColor: '#f6f2ec', show: false,
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; });
    await window.loadURL(origin);
  }).catch(error => {
    dialog.showErrorBox('Token Eater could not start', `Please reopen Token Eater. ${error.code || 'The usage reader is unavailable.'}`);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
}
