const { contextBridge, ipcRenderer } = require('electron');

/**
 * API exposée au site sous window.blablaLauncher.
 * Permet au site de savoir qu'il tourne dans le launcher (l'objet n'existe pas dans un navigateur normal).
 */
contextBridge.exposeInMainWorld('blablaLauncher', {
    isLauncher: true,

    /**
     * Ouvre une URL dans le navigateur par défaut.
     * Utilisé pour le handoff de session (mon compte, panel admin) depuis le launcher.
     * @param {string} url
     */
    openExternal(url) {
        ipcRenderer.invoke('launcher:open-external', url);
    },
});

/**
 * API de mise à jour exposée à update.html.
 * Le natif gère le réseau et l'installation ; la page ne fait qu'afficher et déclencher.
 */
contextBridge.exposeInMainWorld('launcherUpdater', {
    /** Récupère l'état de MAJ calculé au démarrage (version, obligatoire ou non). */
    getStatus() {
        return ipcRenderer.invoke('updater:get-status');
    },

    /** Lance le téléchargement et l'installation. */
    startUpdate() {
        return ipcRenderer.invoke('updater:start');
    },

    /** Ignore une MAJ optionnelle et continue vers le jeu. Sans effet si la MAJ est obligatoire. */
    dismissOptional() {
        return ipcRenderer.invoke('updater:dismiss-optional');
    },

    /**
     * Abonne un callback à la progression du téléchargement (0–100).
     * @param {(percent: number) => void} callback
     */
    onProgress(callback) {
        ipcRenderer.on('updater:progress', (_event, percent) => callback(percent));
    },

    /**
     * Abonne un callback aux erreurs de téléchargement.
     * @param {(message: string) => void} callback
     */
    onError(callback) {
        ipcRenderer.on('updater:error', (_event, message) => callback(message));
    },
});
