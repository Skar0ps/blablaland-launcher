// Preload exécuté dans chaque fenêtre du launcher AVANT le chargement de la page.
// Seul pont autorisé entre le site (Chromium 87) et le natif Electron grâce à
// contextIsolation. On expose une petite API minimale via contextBridge.

const { contextBridge } = require('electron');

/**
 * API exposée au site sous window.blablaLauncher.
 * Le site sait ainsi qu'il tourne dans le launcher (sur un navigateur classique
 * l'objet n'existe pas).
 */
contextBridge.exposeInMainWorld('blablaLauncher', {
    // Indique au site qu'il tourne bien dans le launcher
    isLauncher: true,
});
