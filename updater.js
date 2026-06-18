// Auto-updater du launcher Blablastrae.
//
// Source de vérité des versions : endpoint Laravel GET {GAME_URL}/api/launcher/version
//   -> { latest, minimum }
// Règle :
//   - version installée < minimum  => mise à jour OBLIGATOIRE (le caller affiche un écran bloquant)
//   - minimum <= installée < latest => mise à jour optionnelle
//
// Flow d'installation selon le type de build (cross-platform) :
//   - Windows NSIS / Linux AppImage : electron-updater (download in-app + relance auto)
//   - Windows Portable / macOS DMG  : pas d'auto-update natif fiable -> on ouvre le téléchargement
//     du bon artefact dans le navigateur (macOS : l'utilisateur refait l'install + script Gatekeeper)
//
// Module CommonJS (contrainte launcher), compatible Electron 11.

const { app, shell, net } = require('electron');

const GITHUB_OWNER = 'Skar0ps';
const GITHUB_REPO = 'blablaland-launcher';

/**
 * Effectue une requête GET JSON via la stack réseau d'Electron (net.request).
 * On n'utilise PAS fetch() : il n'existe pas dans le process main d'Electron 11.
 * @param {string} url
 * @returns {Promise<object>}
 */
const fetchJson = (url) => new Promise((resolve, reject) => {
  const request = net.request({ method: 'GET', url });
  request.setHeader('Accept', 'application/json');

  request.on('response', (response) => {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      reject(new Error(`HTTP ${response.statusCode}`));
      return;
    }
    let body = '';
    response.on('data', (chunk) => { body += chunk.toString(); });
    response.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });

  request.on('error', (error) => reject(error));
  request.end();
});

/**
 * Détermine le type de build courant, qui décide du flow de mise à jour.
 * @returns {'portable'|'mac'|'native'}
 *   - 'portable' : build portable Windows (pas d'install, pas d'electron-updater)
 *   - 'mac'      : macOS (signature ad-hoc -> pas d'auto-update Squirrel.Mac fiable)
 *   - 'native'   : NSIS Windows ou AppImage Linux (electron-updater complet)
 */
const getBuildType = () => {
  // electron-builder définit PORTABLE_EXECUTABLE_DIR uniquement pour les builds portables Windows.
  if (process.env.PORTABLE_EXECUTABLE_DIR !== undefined) {
    return 'portable';
  }
  if (process.platform === 'darwin') {
    return 'mac';
  }
  return 'native';
};

/**
 * Compare deux versions semver simples (ex: "1.8.0").
 * @param {string} a
 * @param {string} b
 * @returns {number} <0 si a<b, 0 si égal, >0 si a>b
 */
const compareVersions = (a, b) => {
  const parse = (version) => String(version).split('.').map((part) => parseInt(part, 10) || 0);
  const partsA = parse(a);
  const partsB = parse(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index++) {
    const valueA = partsA[index] || 0;
    const valueB = partsB[index] || 0;
    if (valueA !== valueB) {
      return valueA - valueB;
    }
  }
  return 0;
};

/**
 * Construit l'URL GitHub de téléchargement de l'artefact correspondant au build courant.
 * Les noms suivent le schéma de electron-builder.yml (artifactName).
 * @param {string} version  version à télécharger (ex: "1.9.0")
 * @param {'portable'|'mac'} buildType
 * @returns {string}
 */
const buildDownloadUrl = (version, buildType) => {
  const base = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/`;
  if (buildType === 'mac') {
    // Le zip macOS n'inclut pas la version dans son nom (cf. workflow CI).
    return base + 'Blablastrae-Launcher-macOS.zip';
  }
  // Portable Windows.
  return base + `Blablastrae-Launcher-Portable-${version}.exe`;
};

/**
 * Interroge le site pour connaître les versions latest/minimum et compare à la version installée.
 * @param {string} gameUrl  URL de base du site (sans slash final requis)
 * @returns {Promise<{
 *   ok: boolean,
 *   currentVersion: string,
 *   latestVersion?: string,
 *   minimumVersion?: string,
 *   updateAvailable?: boolean,
 *   mandatory?: boolean,
 *   buildType?: string,
 *   error?: string
 * }>}
 */
const checkForUpdate = async (gameUrl) => {
  const currentVersion = app.getVersion();
  const buildType = getBuildType();

  try {
    const endpoint = gameUrl.replace(/\/+$/, '') + '/api/launcher/version';
    const data = await fetchJson(endpoint);

    const latestVersion = String(data.latest || currentVersion);
    const minimumVersion = String(data.minimum || latestVersion);

    const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
    const mandatory = compareVersions(currentVersion, minimumVersion) < 0;

    return {
      ok: true,
      currentVersion,
      latestVersion,
      minimumVersion,
      updateAvailable,
      mandatory,
      buildType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, currentVersion, buildType, error: message };
  }
};

/**
 * Lance la mise à jour selon le type de build.
 * - 'native' : configure et déclenche electron-updater (download + relance auto via quitAndInstall).
 *   Les callbacks de progression/erreur sont relayés au caller pour mettre à jour l'UI.
 * - 'portable'/'mac' : ouvre le téléchargement de l'artefact dans le navigateur par défaut.
 *
 * @param {object} params
 * @param {string} params.latestVersion  version cible (pour construire l'URL portable/mac)
 * @param {(percent:number)=>void} [params.onProgress]  progression 0-100 (native uniquement)
 * @param {(message:string)=>void} [params.onError]     erreur de mise à jour
 * @returns {Promise<{ mode: 'native'|'external' }>}
 */
const startUpdate = async ({ latestVersion, onProgress, onError }) => {
  const buildType = getBuildType();

  if (buildType !== 'native') {
    // Portable / macOS : on ne peut pas mettre à jour en place de façon fiable -> téléchargement.
    const url = buildDownloadUrl(latestVersion, buildType);
    await shell.openExternal(url);
    return { mode: 'external' };
  }

  // NSIS Windows / AppImage Linux : electron-updater gère tout.
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });

  autoUpdater.removeAllListeners('download-progress');
  autoUpdater.removeAllListeners('error');
  autoUpdater.removeAllListeners('update-downloaded');

  autoUpdater.on('download-progress', (progress) => {
    if (onProgress) {
      onProgress(Math.round(progress.percent));
    }
  });

  autoUpdater.on('error', (error) => {
    if (onError) {
      onError(error instanceof Error ? error.message : String(error));
    }
  });

  // Une fois le téléchargement terminé : quitte et relance sur la nouvelle version.
  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
  });

  // checkForUpdates remplit la cible interne puis on lance le download nous-mêmes.
  await autoUpdater.checkForUpdates();
  await autoUpdater.downloadUpdate();

  return { mode: 'native' };
};

module.exports = {
  getBuildType,
  compareVersions,
  buildDownloadUrl,
  checkForUpdate,
  startUpdate,
};
