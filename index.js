const { app, BrowserWindow, Menu, shell, MenuItem } = require('electron');
const path = require('path');

// --- Configuration ---
const GAME_URL = 'http://blablaland-site.test'; // TODO: Remplacer par l'URL de production
const GAME_ORIGIN = new URL(GAME_URL).origin;
// ---------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // --- Optimisations de performance ---
  // Désactive l'accélération matérielle. Peut améliorer les performances sur les PC
  // très bas de gamme ou avec des pilotes graphiques instables, au détriment d'animations
  // potentiellement moins fluides dans l'interface web (n'affecte pas Flash directement).
  app.disableHardwareAcceleration();

  const createMenu = () => {
    // Optimisation : Pas de menu natif (gain de place et de mémoire)
    Menu.setApplicationMenu(null);
  };

  let splashWindow;
  let splashStartTime;

  // let test;

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
    const mainWindow = new BrowserWindow({
      width: 1040,
      height: 730,
      center: true,
      icon: path.join(__dirname, 'assets/icon.ico'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        plugins: true,
        devTools: false,
        nodeIntegration: false,
        enableRemoteModule: false,
        safeDialogs: true
      },
    });

    // Show the main window when it's ready
    mainWindow.once('ready-to-show', () => {
      const elapsed = Date.now() - splashStartTime;
      const minSplashDuration = 1500; // 1.5s pour laisser l'animation se terminer
      const delay = elapsed >= minSplashDuration ? 0 : minSplashDuration - elapsed;

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.executeJavaScript('document.body.classList.add("fade-out")');
          setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
              splashWindow.destroy();
            }
            mainWindow.show();
          }, 500);
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

    // Sécurité : Intercepter et définir la Content Security Policy (CSP)
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            `default-src 'self' ${GAME_ORIGIN} data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GAME_ORIGIN}; object-src 'self' 'unsafe-inline' 'unsafe-eval' ${GAME_ORIGIN}; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src *;`
          ]
        }
      });
    });

    // Sécurité : Bloquer les demandes de permissions (caméra, micro, notifications, etc.)
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false);
    });

    // Sécurité : Empêcher la navigation vers des sites tiers
    mainWindow.webContents.on('will-navigate', (event, url) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.origin !== GAME_ORIGIN) {
        event.preventDefault();
      }
    });

    // Sécurité : Gérer l'ouverture de nouvelles fenêtres (bloquer ou ouvrir dans le navigateur par défaut)
    mainWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      if (url.startsWith('http')) {
        shell.openExternal(url);
      }
    });

    // Load the URL into the main window
    mainWindow.loadURL(GAME_URL);
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
