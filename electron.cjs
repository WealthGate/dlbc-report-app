const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const HOSTED_APP = 'https://dlbcdom.web.app';
const isAllowedExternal = url => /^(https?:|mailto:)/i.test(url);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    icon: path.join(__dirname, 'assets/icon.ico')
  });

  // Installed clients receive the same fixes as the website on each launch.
  // Do not load remote content with Node.js integration enabled.
  const startUrl = app.isPackaged ? HOSTED_APP : (process.env.ELECTRON_START_URL || 'http://localhost:5173');
  const trustedOrigin = new URL(startUrl).origin;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || (isAllowedExternal(url) && new URL(url).origin === trustedOrigin)) {
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    }
    if (isAllowedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== trustedOrigin) {
      event.preventDefault();
      if (isAllowedExternal(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('did-fail-load', async (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    const result = await dialog.showMessageBox(win, { type: 'warning', title: 'DLBC Reporting', message: 'The current app could not be loaded. Check your internet connection. Your saved reports have not been deleted.', buttons: ['Retry', 'Close'], defaultId: 0 });
    if (result.response === 0) win.loadURL(startUrl);
    else win.close();
  });
  win.loadURL(startUrl);

  // Remove menu bar for cleaner look
  win.setMenuBarVisibility(false);
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else {
  app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
