const { app, BrowserWindow, Menu, shell, MenuItem } = require('electron');
const windowStateKeeper = require('electron-window-state');
const path = require('path');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const createMenu = () => {
    const menu = Menu.getApplicationMenu();
    const viewMenu = menu.items.find(item => item.role === 'viewmenu');
    if (viewMenu) {
      const filteredItems = viewMenu.submenu.items;
      Menu.setApplicationMenu(Menu.buildFromTemplate(filteredItems));
    }
  };

  let splashWindow;
  let splashStartTime;

  const createSplashWindow = () => {
    splashStartTime = Date.now();
    splashWindow = new BrowserWindow({
      width: 512,
      height: 512,
      frame: false,
      transparent: true,
      resizable: false,
      center: true,
      icon: path.join(__dirname, 'assets/icon.ico'),
      webPreferences: { devTools: false }
    });
    splashWindow.loadFile(path.join(__dirname, 'assets/splash.html'));
  };

  const createWindow = () => {
    const mainWindowState = windowStateKeeper({
      defaultWidth: 1040,
      defaultHeight: 730,
    });

    const mainWindow = new BrowserWindow({
      ...mainWindowState,
      center: true,
      icon: path.join(__dirname, 'assets/icon.ico'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        plugins: true,
        devTools: false
      },
    });

    // Show the main window when it's ready
    mainWindow.once('ready-to-show', () => {
      const elapsed = Date.now() - splashStartTime;
      const delay = elapsed >= 1000 ? 0 : 1000 - elapsed;

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.executeJavaScript('document.body.classList.add("fade-out")');
          setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.destroy();
            }
            mainWindow.show();
          }, 1000);
        } else {
          mainWindow.show();
        }
      }, delay);
    });

    // Display context menu
    mainWindow.webContents.on('context-menu', (event, params) => {
      const contextMenu = Menu.buildFromTemplate([
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ]);
      contextMenu.popup(mainWindow, params.x, params.y);
    });

    // Load the URL into the main window
    mainWindow.loadURL('http://blablaland-site.test');

    // Manage window state
    mainWindowState.manage(mainWindow);
  };

  const initializeFlashPlugin = () => {
    let pluginName;
    switch (process.platform) {
      case 'win32':
        pluginName = app.isPackaged ? 'pepflashplayer.dll' : 'win/x64/pepflashplayer.dll';
        break;
      case 'darwin':
        pluginName = 'PepperFlashPlayer.plugin';
        break;
      default:
        pluginName = 'libpepflashplayer.so';
    }

    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;

    if (['freebsd', 'linux', 'netbsd', 'openbsd'].includes(process.platform)) {
      app.commandLine.appendSwitch('no-sandbox');
    }

    app.commandLine.appendSwitch('ppapi-flash-path', path.join(resourcesPath, 'plugins', pluginName));
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.465');
  };

  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  initializeFlashPlugin();

  app.whenReady().then(() => {
    createMenu();
    createSplashWindow();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}
