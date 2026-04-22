const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'build/icon.png') // You can add an icon later
  });

  // In production, load the built file. In development, load the local server.
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'dist/index.html')}`;
  win.loadURL(startUrl);

  // Remove menu bar for cleaner look
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

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
