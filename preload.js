// Preload exécuté dans chaque fenêtre du launcher AVANT le chargement de la page.
// Seul pont autorisé entre le site (Chromium 87) et le natif Electron grâce à
// contextIsolation. On expose une petite API minimale via contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

/**
 * API exposée au site sous window.blablaLauncher.
 * Le site sait ainsi qu'il tourne dans le launcher (sur un navigateur classique
 * l'objet n'existe pas).
 */
contextBridge.exposeInMainWorld('blablaLauncher', {
    // Indique au site qu'il tourne bien dans le launcher
    isLauncher: true,

    /**
     * Ouvre une URL dans le navigateur par défaut (le natif valide l'URL).
     * Utilisé pour le handoff de session (Mon compte / Panel) : le site fetch un
     * lien de connexion signé puis demande au launcher de l'ouvrir.
     * @param {string} url
     */
    openExternal(url) {
        ipcRenderer.invoke('launcher:open-external', url);
    },
});

/**
 * API de l'auto-updater, exposée à la page de mise à jour locale (update.html).
 * Le natif gère tout le travail (réseau, electron-updater, relance) ; la page ne fait
 * qu'afficher l'état et déclencher les actions.
 */
contextBridge.exposeInMainWorld('launcherUpdater', {
    /**
     * Récupère l'état de mise à jour calculé par le natif (versions, obligatoire ou non).
     * @returns {Promise<object>}
     */
    getStatus() {
        return ipcRenderer.invoke('updater:get-status');
    },

    /**
     * Démarre la mise à jour (download + relance auto sur NSIS/AppImage, ou téléchargement
     * navigateur sur portable/macOS).
     * @returns {Promise<object>}
     */
    startUpdate() {
        return ipcRenderer.invoke('updater:start');
    },

    /**
     * Ignore une mise à jour OPTIONNELLE et continue vers le jeu. Sans effet pour une MAJ
     * obligatoire (le natif ne charge pas le jeu tant que pas à jour).
     */
    dismissOptional() {
        return ipcRenderer.invoke('updater:dismiss-optional');
    },

    /**
     * Abonne un callback à la progression du téléchargement (0-100), cas natif uniquement.
     * @param {(percent:number)=>void} callback
     */
    onProgress(callback) {
        ipcRenderer.on('updater:progress', (_event, percent) => callback(percent));
    },

    /**
     * Abonne un callback aux erreurs de mise à jour.
     * @param {(message:string)=>void} callback
     */
    onError(callback) {
        ipcRenderer.on('updater:error', (_event, message) => callback(message));
    },
});
