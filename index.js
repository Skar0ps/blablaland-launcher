const { app, BrowserWindow, Menu, MenuItem, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// const GAME_URL = 'https://blablaland-site.test';
const GAME_URL = 'https://beta.blablastrae.com';

const GAME_ORIGIN = new URL(GAME_URL).origin;

const BETA_USER = Buffer.from('dGVzdGVy', 'base64').toString()
const BETA_PASS = Buffer.from('ZmFyaW5lYXJhYmU=', 'base64').toString();

const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {

  const createMenu = () => {
    const menuTemplate = [
      {
        label: 'Application',
        submenu: [
          { label: 'Recharger', role: 'reload' },
          {
            label: 'Recharger (F5)',
            accelerator: 'F5',
            click: (_, focusedWindow) => {
              if (focusedWindow) focusedWindow.webContents.reload();
            }
          },
          { label: 'Forcer le rechargement', role: 'forceReload' },
          { type: 'separator' },
          {
            label: 'Plein écran',
            accelerator: 'F11',
            click: (_, focusedWindow) => {
              if (focusedWindow) focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
            }
          }
        ]
      }
    ];

    if (isDev) {
      menuTemplate[0].submenu.push({ type: 'separator' });
      menuTemplate[0].submenu.push({ label: 'Ouvrir les DevTools', role: 'toggleDevTools' });
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  };

  const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

  const loadWindowState = () => {
    try {
      return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    } catch {
      return null;
    }
  };

  const saveWindowState = (win) => {
    if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getBounds();
    fs.writeFileSync(windowStatePath, JSON.stringify(bounds));
  };

  let splashWindow;
  let splashStartTime;

  const centerOnCurrentDisplay = (width, height) => {
    const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return {
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + (bounds.height - height) / 2)
    };
  };

  const createSplashWindow = () => {
    splashWindow = new BrowserWindow({
      width: 512,
      height: 512,
      frame: false,
      transparent: true,
      resizable: false,
      show: false,
      ...centerOnCurrentDisplay(512, 512),
      icon: path.join(__dirname, 'build/logo.png'),
      webPreferences: { devTools: false }
    });
    splashWindow.loadFile(path.join(__dirname, 'assets/splash.html'));
    splashWindow.once('ready-to-show', () => {
      splashWindow.show();
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashStartTime = Date.now();
          splashWindow.webContents.executeJavaScript('document.body.classList.add("animate")');
        }
      }, 100);
    });
  };

  const createWindow = () => {
    const savedState = loadWindowState();
    const defaultWidth = 1280;
    const defaultHeight = 720;
    const windowPos = savedState
      ? { x: savedState.x, y: savedState.y, width: savedState.width, height: savedState.height }
      : { width: defaultWidth, height: defaultHeight, ...centerOnCurrentDisplay(defaultWidth, defaultHeight) };

    const mainWindow = new BrowserWindow({
      ...windowPos,
      icon: path.join(__dirname, 'build/logo.png'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        plugins: true,
        devTools: isDev,  
        nodeIntegration: false,
        enableRemoteModule: false,
        safeDialogs: true
      },
    });

    mainWindow.on('close', () => saveWindowState(mainWindow));

    mainWindow.webContents.on('did-start-loading', () => {
      mainWindow.setProgressBar(2); // mode indéterminé (animation pulsante)
    });

    mainWindow.webContents.on('did-stop-loading', () => {
      mainWindow.setProgressBar(-1); // retire la barre
    });

    mainWindow.once('ready-to-show', () => {
      const elapsed = Date.now() - splashStartTime;
      const minSplashDuration = 1100;
      const delay = elapsed >= minSplashDuration ? 0 : minSplashDuration - elapsed;

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.executeJavaScript('document.body.classList.add("fade-out")');
          setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
            mainWindow.show();
          }, 1000);
        } else {
          mainWindow.show();
        }
      }, delay);
    });

    const attachContextMenu = (win) => {
      win.webContents.on('context-menu', (_event, params) => {
        const contextMenu = Menu.buildFromTemplate([
          { role: 'reload', label: "Recharger la page"},
          { role: 'forceReload', label: "Forcer le rechargement"},
          { type: 'separator' },
          { role: 'resetZoom', label: "Réinitialiser zoom"},
          { role: 'zoomIn', label: "Zoomer"},
          { role: 'zoomOut', label: "Dézoomer"},
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Plein écran'},
        ]);
        if (isDev) {
          contextMenu.append(new MenuItem({ type: 'separator' }));
          contextMenu.append(new MenuItem({
            label: 'Devtools',
            click: () => {
              win.webContents.inspectElement(params.x, params.y);
            }
          }));
        }
        contextMenu.popup(win, params.x, params.y);
      });
    };

    attachContextMenu(mainWindow);

    mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'User-Agent': details.requestHeaders['User-Agent'] + ' BlablaLauncher/1.0'
        }
      });
    });

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      if (isDev) {
        // en dev : pas de CSP injectée, on laisse passer les headers du serveur tels quels
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      // CSP stricte en production
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            [
              `default-src 'self' ${GAME_ORIGIN} data: blob:`,
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GAME_ORIGIN}`,
              `object-src 'self' ${GAME_ORIGIN}`,
              `style-src * 'unsafe-inline'`,
              `img-src * data: blob:`,
              `font-src * data:`,
              `connect-src * ws: wss:`,  // ws: explicite pour les WebSockets
              `media-src 'self' ${GAME_ORIGIN}`
            ].join('; ')
          ]
        }
      });
    });


    // bloquer toutes les demandes de permissions (caméra, micro, notifications, etc.)
    mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    const confirmAndOpenExternal = (url) => {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Annuler', 'Ouvrir'],
        defaultId: 1,
        cancelId: 0,
        title: 'Lien externe',
        message: 'Êtes-vous sûr d\'ouvrir cette page ?',
        detail: 'Elle sera ouverte dans votre navigateur par défaut car elle ne fait pas partie de Blablastrae.'
      });
      if (choice === 1) shell.openExternal(url);
    };

    mainWindow.webContents.on('will-navigate', (event, url) => {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.origin !== GAME_ORIGIN) {
          event.preventDefault();
          confirmAndOpenExternal(url);
        }
      } catch (e) {
        event.preventDefault(); 
      }
    });

    mainWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      try {
        const urlOrigin = new URL(url).origin;
        if (urlOrigin === GAME_ORIGIN) {
          const { bounds } = screen.getDisplayMatching(mainWindow.getBounds());
          const newWin = new BrowserWindow({
            width: 1024,
            height: 768,
            x: Math.round(bounds.x + (bounds.width - 1024) / 2),
            y: Math.round(bounds.y + (bounds.height - 768) / 2),
            autoHideMenuBar: true,
            icon: path.join(__dirname, 'build/logo.png'),
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              enableRemoteModule: false,
              plugins: true,
              devTools: isDev
            }
          });
          newWin.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            callback({
              requestHeaders: {
                ...details.requestHeaders,
                'User-Agent': details.requestHeaders['User-Agent'] + ' BlablaLauncher/1.0'
              }
            });
          });
          attachContextMenu(newWin);
          newWin.webContents.on('login', (event, _authDetails, authInfo, callback) => {
            if (authInfo.isProxy || authInfo.host !== new URL(GAME_URL).hostname) return;
            event.preventDefault();
            callback(BETA_USER, BETA_PASS);
          });
          newWin.loadURL(url);
        } else if (url.startsWith('https://') || url.startsWith('http://')) {
          confirmAndOpenExternal(url);
        }
      } catch (e) {
      }
    });

    // authentification HTTP Basic (protection nginx 401)
    mainWindow.webContents.on(
      'login',
      (event, _authDetails, authInfo, callback) => {
        if (authInfo.isProxy || authInfo.host !== new URL(GAME_URL).hostname) return;
        event.preventDefault();
        callback(BETA_USER, BETA_PASS);
      }
    );
    mainWindow.loadURL(GAME_URL);

    if (isDev) mainWindow.webContents.openDevTools();
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
    if (process.platform !== 'darwin') app.quit();
  });

  initializeFlashPlugin();

  app.whenReady().then(() => {
    createMenu();
    createSplashWindow();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}