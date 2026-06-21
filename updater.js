// source de vérité : GET {GAME_URL}/api/launcher/version -> { latest, minimum }
// version < minimum  -> MAJ obligatoire (écran bloquant)
// minimum <= version < latest -> MAJ optionnelle
//
// flow selon le build :
//   NSIS / AppImage -> electron-updater (téléchargement in-app + relance auto)
//   Portable / macOS -> ouverture du téléchargement dans le navigateur

const { app, shell, net } = require('electron');

const GITHUB_OWNER = 'Skar0ps';
const GITHUB_REPO = 'blablaland-launcher';

/**
 * Requête GET JSON via net.request (fetch() n'existe pas dans le process main d'Electron 11).
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
 * Détermine le type de build, qui décide du flow de mise à jour.
 * @returns {'portable'|'mac'|'native'}
 */
const getBuildType = () => {
  // PORTABLE_EXECUTABLE_DIR est défini par electron-builder uniquement pour les portables Windows
  if (process.env.PORTABLE_EXECUTABLE_DIR !== undefined) {
    return 'portable';
  }
  if (process.platform === 'darwin') {
    return 'mac';
  }
  return 'native';
};

/**
 * Compare deux versions semver simples ("1.8.0").
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
 * Construit l'URL GitHub de téléchargement pour un build portable ou macOS.
 * Les noms d'artefacts suivent le schéma défini dans electron-builder.yml.
 * @param {string} version
 * @param {'portable'|'mac'} buildType
 * @returns {string}
 */
const buildDownloadUrl = (version, buildType) => {
  const base = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/`;
  if (buildType === 'mac') {
    // le zip macOS n'inclut pas la version dans son nom (cf. workflow CI)
    return base + 'Blablastrae-Launcher-macOS.zip';
  }
  return base + `Blablastrae-Launcher-Portable-${version}.exe`;
};

/**
 * Interroge le site pour connaître les versions latest/minimum et les compare à la version installée.
 * @param {string} gameUrl  URL de base du site
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

    return { ok: true, currentVersion, latestVersion, minimumVersion, updateAvailable, mandatory, buildType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, currentVersion, buildType, error: message };
  }
};

/**
 * Lance la mise à jour selon le type de build.
 * - native (NSIS/AppImage) : electron-updater télécharge et relance automatiquement
 * - portable/mac : ouvre le téléchargement dans le navigateur
 *
 * @param {object} params
 * @param {string} params.latestVersion
 * @param {(percent: number) => void} [params.onProgress]  progression 0–100 (native uniquement)
 * @param {(message: string) => void} [params.onError]
 * @returns {Promise<{ mode: 'native'|'external' }>}
 */
const startUpdate = async ({ latestVersion, onProgress, onError }) => {
  const buildType = getBuildType();

  if (buildType !== 'native') {
    const url = buildDownloadUrl(latestVersion, buildType);
    await shell.openExternal(url);
    return { mode: 'external' };
  }

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
    if (onProgress) onProgress(Math.round(progress.percent));
  });

  autoUpdater.on('error', (error) => {
    if (onError) onError(error instanceof Error ? error.message : String(error));
  });

  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
  });

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
