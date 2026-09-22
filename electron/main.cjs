const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "CORVUS // DAT EDITOR",
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.setMenuBarVisibility(false);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, boot the bundled server so backend API works
    try {
      require(path.join(__dirname, '../dist/server.cjs'));
      // Wait for server to bind port, then load localhost
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
      }, 500);
    } catch (err) {
      console.error("Failed to start bundled server:", err);
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
