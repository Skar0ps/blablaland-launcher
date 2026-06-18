const { app, BrowserWindow, Menu, shell, dialog, screen, ipcMain } = require('electron');
const contextMenu = require('electron-context-menu');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

// Chemin du preload partagé par toutes les fenêtres (pont site <-> natif)
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

const _devConfig = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'dev.config.json'), 'utf8')); }
  catch { return {}; }
})();
const GAME_URL = process.env.GAME_URL || _devConfig.gameUrl || 'https://beta.blablastrae.com';

const GAME_ORIGIN = new URL(GAME_URL).origin;
const GAME_DOMAIN = 'blablastrae.com';


const isGameUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const origin = parsed.origin;
    return origin === GAME_ORIGIN
      || host === GAME_DOMAIN
      || host.endsWith('.' + GAME_DOMAIN);
  } catch {
    return false;
  }
};

// Chemins autorisés à s'afficher DANS le launcher. Tout le reste du site
// (mon compte, forum, panel animation, inscription…) s'ouvre dans le navigateur
// par défaut. Le launcher est un client de jeu minimal : entrée + jeu + console.
const ALLOWED_LAUNCHER_PATHS = [
  /^\/launcher(\/|$)/,   // point d'entrée + écran de reprise de session
  /^\/login(\/|$)/,      // POST de connexion (le formulaire d'auth launcher poste ici)
  /^\/logout(\/|$)/,     // POST de déconnexion
  /^\/game-light(\/|$)/, // le jeu
  /^\/console\/view(\/|$)/, // la console (page Flash, reste dans le launcher)
];

/**
 * Vrai si l'URL fait partie du domaine du jeu ET d'un chemin autorisé dans le launcher.
 * @param {string} url
 * @returns {boolean}
 */
const isAllowedInLauncher = (url) => {
  if (!isGameUrl(url)) {
    return false;
  }
  try {
    const pathname = new URL(url).pathname;
    return ALLOWED_LAUNCHER_PATHS.some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
};

const isDev = !app.isPackaged;

// Custom URI scheme du launcher (déclaré dans electron-builder.yml, schemes: blablastrae-desktop).
// La page game du site ouvre "blablastrae-desktop://play" pour lancer le jeu directement.
const PROTOCOL_SCHEME = 'blablastrae-desktop';

/**
 * Cherche dans une liste d'arguments (process.argv ou second-instance) le premier
 * argument qui est une URL de notre scheme. Retourne l'URL ou null.
 * @param {string[]} argv
 * @returns {string|null}
 */
const findDeepLinkInArgv = (argv) => {
  if (!Array.isArray(argv)) {
    return null;
  }
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(PROTOCOL_SCHEME + '://')) || null;
};

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
          },
          { type: 'separator' },
          { label: 'Quitter', role: 'quit' }
        ]
      },
      {
        label: 'Édition',
        submenu: [
          { label: 'Annuler', role: 'undo' },
          { label: 'Rétablir', role: 'redo' },
          { type: 'separator' },
          { label: 'Couper', role: 'cut' },
          { label: 'Copier', role: 'copy' },
          { label: 'Coller', role: 'paste' },
          { label: 'Supprimer', role: 'delete' },
          { type: 'separator' },
          { label: 'Tout sélectionner', role: 'selectAll' }
        ]
      },
      {
        label: 'Affichage',
        submenu: [
          { label: 'Zoomer', role: 'zoomIn' },
          { label: 'Dézoomer', role: 'zoomOut' },
          { label: 'Réinitialiser le zoom', role: 'resetZoom' },
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
      menuTemplate[0].submenu.splice(-2, 0, { label: 'Ouvrir les DevTools', role: 'toggleDevTools' });
      menuTemplate[0].submenu.splice(-2, 0, { type: 'separator' });
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  };

  /**
   * context menu contextuel (copier/coller/lien/image) et raccourci Ctrl+F.
   * appelée sur chaque BrowserWindow
   * @param {BrowserWindow} win
   */
  const enhanceWindow = (win) => {
    const webContents = win.webContents;

    contextMenu({
      window: win,
      // Flash exempté : on ne remplace pas le menu natif du plugin Flash
      shouldShowMenu: (_event, params) => params.mediaType !== 'plugin',
      showInspectElement: isDev,
      // bouton custom vers le Wiktionnaire (dictionnaire FR libre), ajouté via prepend plutot que google.
      showSearchWithGoogle: false,
      prepend: (_defaultActions, params) => {
        const selection = (params.selectionText || '').trim();
        if (!selection) {
          return [];
        }
        // on limite à un mot/expression court pour que ça ait du sens en dico.
        const query = encodeURIComponent(selection);
        return [
          {
            label: `Rechercher « ${selection.length > 30 ? selection.slice(0, 30) + '…' : selection} » dans le dictionnaire`,
            click: () => {
              shell.openExternal(`https://fr.wiktionary.org/wiki/${query}`);
            },
          },
          { type: 'separator' },
        ];
      },
      labels: {
        copy: 'Copier',
        cut: 'Couper',
        paste: 'Coller',
        selectAll: 'Tout sélectionner',
        copyLink: "Copier l'adresse du lien",
        inspect: 'Inspecter',
        learnSpelling: "Apprendre l'orthographe",
      },
      // Options custom ajoutées en bas du menu (recharger / zoom)
      append: () => [
        { type: 'separator' },
        { role: 'reload', label: 'Recharger la page' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Réinitialiser le zoom' },
        { role: 'zoomIn', label: 'Zoomer' },
        { role: 'zoomOut', label: 'Dézoomer' },
      ],
    });
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
  // Référence à la fenêtre principale, pour router les deep links dessus (et pas sur le splash,
  // qui peut être la seule fenêtre existante au moment où un deep link arrive au démarrage).
  let mainWindowRef = null;

  /**
   * Route une URL de deep link entrante vers la fenêtre principale du launcher.
   * Toute URL de notre scheme mène au point d'entrée /launcher (qui décide jeu direct
   * si connecté, sinon écran de connexion). On valide le scheme avant d'agir.
   * @param {string} url
   */
  const handleDeepLink = (url) => {
    if (typeof url !== 'string' || !url.startsWith(PROTOCOL_SCHEME + '://')) {
      return;
    }
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      return;
    }
    if (mainWindowRef.isMinimized()) {
      mainWindowRef.restore();
    }
    mainWindowRef.focus();
    // On repasse par loadStartPage : un deep link ne doit jamais contourner une MAJ obligatoire.
    loadStartPage();
  };

  // Dernier état de mise à jour calculé (partagé avec les handlers IPC de update.html).
  let updateStatus = null;

  /**
   * Charge le point d'entrée du jeu (/launcher), qui décide auth vs reprise de session.
   */
  const loadGame = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.loadURL(GAME_URL.replace(/\/+$/, '') + '/launcher');
    }
  };

  /**
   * Vérifie la version au démarrage puis charge la bonne page :
   * - MAJ obligatoire OU optionnelle disponible -> écran de mise à jour (update.html)
   * - sinon (ou check en échec) -> le jeu directement (on ne bloque jamais sur une erreur réseau)
   */
  const loadStartPage = async () => {
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      return;
    }
    updateStatus = await updater.checkForUpdate(GAME_URL);

    // En cas d'échec du check (réseau, site down), on laisse passer vers le jeu :
    // mieux vaut un launcher utilisable qu'un blocage sur une erreur transitoire.
    if (updateStatus.ok && updateStatus.updateAvailable) {
      mainWindowRef.loadFile(path.join(__dirname, 'assets/update.html'));
      return;
    }
    loadGame();
  };

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
      icon: path.join(__dirname, 'build/icon.png'),
      webPreferences: { devTools: false, sandbox: true }
    });
    splashWindow.loadFile(path.join(__dirname, 'assets/splash.html'));
    splashWindow.once('ready-to-show', () => {
      splashStartTime = Date.now();
      splashWindow.show();
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
      icon: path.join(__dirname, 'build/icon.png'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        sandbox: true,
        plugins: true,
        devTools: isDev,
        nodeIntegration: false,
        enableRemoteModule: false,
        safeDialogs: true,
      },
    });

    mainWindowRef = mainWindow;
    mainWindow.on('close', () => saveWindowState(mainWindow));

    mainWindow.webContents.on('did-start-loading', () => {
      mainWindow.setProgressBar(2);
    });

    mainWindow.webContents.on('did-stop-loading', () => {
      mainWindow.setProgressBar(-1);
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

    enhanceWindow(mainWindow);

    mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'User-Agent': details.requestHeaders['User-Agent'] + ' BlablaLauncher/' + app.getVersion()
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
              `default-src 'self' https://*.${GAME_DOMAIN} data: blob:`,
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.${GAME_DOMAIN}`,
              `object-src 'self' https://*.${GAME_DOMAIN}`,
              `style-src * 'unsafe-inline'`,
              `img-src * data: blob:`,
              `font-src * data:`,
              `connect-src * ws: wss:`,
              `media-src 'self' https://*.${GAME_DOMAIN}`
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

    // Une page du jeu mais non autorisée dans le launcher (mon compte, forum…)
    // s'ouvre directement dans le navigateur par défaut, sans dialog (c'est un
    // lien légitime du site, juste hors périmètre launcher). Un lien hors domaine
    // garde la confirmation (sécurité).
    const handleDisallowedUrl = (url) => {
      if (isGameUrl(url)) {
        shell.openExternal(url);
      } else {
        confirmAndOpenExternal(url);
      }
    };

    mainWindow.webContents.on('will-navigate', (event, url) => {
      try {
        if (!isAllowedInLauncher(url)) {
          event.preventDefault();
          handleDisallowedUrl(url);
        }
      } catch (e) {
        event.preventDefault();
      }
    });

    mainWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      try {
        if (isAllowedInLauncher(url)) {
          // Page autorisée (console notamment) → nouvelle fenêtre dans le launcher.
          const { bounds } = screen.getDisplayMatching(mainWindow.getBounds());
          const newWin = new BrowserWindow({
            width: 1024,
            height: 768,
            x: Math.round(bounds.x + (bounds.width - 1024) / 2),
            y: Math.round(bounds.y + (bounds.height - 768) / 2),
            autoHideMenuBar: true,
            icon: path.join(__dirname, 'build/icon.png'),
            webPreferences: {
              preload: PRELOAD_PATH,
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
              enableRemoteModule: false,
              plugins: true,
              devTools: isDev
            }
          });
          enhanceWindow(newWin);
          newWin.loadURL(url);
        } else if (url.startsWith('https://') || url.startsWith('http://')) {
          // Tout le reste (pages du site hors périmètre, liens externes) → navigateur.
          handleDisallowedUrl(url);
        }
      } catch (e) {
      }
    });

    // Au démarrage : vérifie d'abord la version (écran de MAJ si besoin), sinon charge le jeu.
    loadStartPage();

    if (isDev) mainWindow.webContents.openDevTools();
  };

  const initializeFlashPlugin = () => {
    let pluginPath;
    const arch = process.arch === 'ia32' ? 'ia32' : 'x64';

    if (app.isPackaged) {
      switch (process.platform) {
        case 'win32':
          pluginPath = path.join(process.resourcesPath, 'plugins', 'pepflashplayer.dll');
          break;
        case 'darwin':
          pluginPath = path.join(process.resourcesPath, 'plugins', 'PepperFlashPlayer.plugin');
          break;
        default:
          pluginPath = path.join(process.resourcesPath, 'plugins', 'libpepflashplayer.so');
      }
    } else {
      switch (process.platform) {
        case 'win32':
          pluginPath = path.join(__dirname, 'plugins', 'win', arch, 'pepflashplayer.dll');
          break;
        case 'darwin':
          pluginPath = path.join(__dirname, 'plugins', 'mac', 'x64', 'PepperFlashPlayer.plugin');
          break;
        default:
          pluginPath = path.join(__dirname, 'plugins', 'linux', arch, 'libpepflashplayer.so');
      }
    }

    if (['freebsd', 'linux', 'netbsd', 'openbsd'].includes(process.platform)) {
      app.commandLine.appendSwitch('no-sandbox');
    }

    app.commandLine.appendSwitch('ppapi-flash-path', pluginPath);
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.465');
  };

  // Windows/Linux : quand une instance tourne déjà, un nouveau lancement (ex. clic sur
  // blablastrae-desktop://play) transmet ses arguments ici. On parse le deep link s'il y en a un.
  app.on('second-instance', (_event, argv) => {
    const deepLink = findDeepLinkInArgv(argv);
    if (deepLink) {
      handleDeepLink(deepLink);
      return;
    }
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS : le deep link n'arrive pas dans argv mais via cet event (peut survenir
  // avant ou après whenReady). preventDefault pour signaler qu'on le gère nous-mêmes.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Ouverture d'une URL dans le navigateur par défaut, demandée par le site
  // (handoff de session : Mon compte / Panel). On valide que l'URL appartient
  // bien au domaine du jeu avant d'ouvrir, par sécurité.
  ipcMain.handle('launcher:open-external', (_event, url) => {
    if (typeof url === 'string' && isGameUrl(url)) {
      shell.openExternal(url);
    }
  });

  // --- Auto-updater : canaux consommés par assets/update.html via le preload ---

  // Renvoie l'état de MAJ calculé au démarrage (versions, obligatoire ou non, type de build).
  ipcMain.handle('updater:get-status', () => updateStatus);

  // Lance la mise à jour. Relaie progression/erreur (cas natif NSIS/AppImage) vers la page.
  ipcMain.handle('updater:start', async () => {
    if (!updateStatus || !updateStatus.ok) {
      return { mode: 'external' };
    }
    return updater.startUpdate({
      latestVersion: updateStatus.latestVersion,
      onProgress: (percent) => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('updater:progress', percent);
        }
      },
      onError: (message) => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('updater:error', message);
        }
      },
    });
  });

  // MAJ optionnelle reportée : on continue vers le jeu. Ignoré si la MAJ est obligatoire
  // (garde-fou : la page n'affiche pas "plus tard" dans ce cas, mais on double-vérifie ici).
  ipcMain.handle('updater:dismiss-optional', () => {
    if (updateStatus && updateStatus.mandatory) {
      return;
    }
    loadGame();
  });

  // Enregistre le launcher comme handler du scheme blablastrae-desktop:// auprès de l'OS.
  // En production l'enregistrement vient surtout de l'installeur (electron-builder), mais cet
  // appel couvre le mode portable et garantit l'enregistrement au 1er run. Sous Windows en dev
  // (non packagé), il faut passer execPath + le script pour que l'OS sache quoi relancer.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }

  initializeFlashPlugin();

  app.whenReady().then(() => {
    createMenu();
    createSplashWindow();
    createWindow();

    // Cold start Windows/Linux : si le launcher a été lancé via le protocole (URL dans argv),
    // on route une fois la fenêtre créée. (Sans deep link, createWindow charge déjà /launcher.)
    const initialDeepLink = findDeepLinkInArgv(process.argv);
    if (initialDeepLink) {
      handleDeepLink(initialDeepLink);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}