// Preload exécuté dans chaque fenêtre du launcher AVANT le chargement de la page.
// Seul pont autorisé entre le site (Chromium 87) et le natif Electron grâce à
// contextIsolation. On expose une petite API sûre via contextBridge pour
// déclencher des fonctionnalités natives que Chromium 87 n'a pas (ex: findInPage).

const { contextBridge, ipcRenderer } = require('electron');

// Canal IPC : le natif intercepte Ctrl+F et demande au site d'ouvrir sa barre
// de recherche (recherche faite 100% en JS côté page, cf. find-bar.js).
const FIND_OPEN_REQUEST = 'launcher:find-open-request';

/**
 * API exposée au site sous window.blablaLauncher.
 * Le site sait qu'il tourne dans le launcher (via User-Agent) et peut donc
 * appeler ces fonctions; sur un navigateur classique l'objet n'existe pas.
 */
contextBridge.exposeInMainWorld('blablaLauncher', {
    // Indique au site qu'il tourne bien dans le launcher
    isLauncher: true,

    /**
     * Enregistre un callback déclenché quand le natif demande l'ouverture
     * de la barre de recherche (raccourci Ctrl+F intercepté côté natif).
     * @param {() => void} callback
     */
    onFindOpenRequest(callback) {
        ipcRenderer.on(FIND_OPEN_REQUEST, () => callback());
    },
});
