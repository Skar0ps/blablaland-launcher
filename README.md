# Launcher Blablaland

Launcher basé sur Electron permettant de jouer à Blablaland (ou tout autre jeu flash présent sur un site web).

Basé à l'origine sur le launcher de [Panfu](https://github.com/teampanfu/panfu-desktop).

## Table des matières

*   [Installation et Configuration](#installation-et-configuration)
*   [Développement](#développement)
*   [Intégration Continue](#intégration-continue-github-actions)
*   [Multiple Instances](#instances-multiples-en-parallèle)

## ★ Prérequis

*   [Node.js](https://nodejs.org/) (Version LTS recommandée)
*   [Yarn](https://yarnpkg.com/) (`npm install -g yarn`)

## Installation et Configuration

1.  Clonez ce repo.
2.  Installez les dépendances :
    ```bash
    yarn install
    ```

## Développement

Pour lancer l'application en mode développement (+ outils de debug activés) :

```bash
yarn start
```

Pour compiler une version Windows locale :

```bash
yarn dist
```

## Intégration Continue (GitHub Actions)

Ce projet utilise GitHub Actions pour compiler automatiquement les installateurs pour toutes les plateformes dans le cloud. C'est indispensable si vous n'avez pas de machine macOS, car Apple ne permet pas de compiler pour macOS en dehors d'un environnement Apple.

La configuration se trouve dans `.github/workflows/main.yml`.

### Première configuration

**Aucune configuration particulière n'est nécessaire.** GitHub Actions a accès à votre repo automatiquement via son token intégré (`GITHUB_TOKEN`). Il suffit que le fichier `.github/workflows/main.yml` soit présent dans le repo (ce qui est déjà le cas).

### Procédure de Release

Pour déclencher un build et générer les installateurs d'une nouvelle version :

1.  Assurez-vous que tout votre code est commit et pushed sur `main`.
2.  Créez un tag Git correspondant à la version (le tag **doit** commencer par `v`) :
    ```bash
    git tag v1.0.0
    ```
3.  Envoyez le tag sur GitHub :
    ```bash
    git push origin v1.0.0
    ```

GitHub Actions détectera le tag automatiquement et lancera deux jobs en parallèle :
- **Windows & Linux** - sur un runner Ubuntu avec Wine (via Docker)
- **macOS** - sur un runner macOS natif (nécessaire pour compiler `.dmg`)

### Suivre le build

Une fois le tag poussé, allez dans l'onglet **Actions** de votre repo GitHub. Vous verrez le workflow **"Build Release"** en cours d'exécution. Chaque job prend environ 5-10 minutes.

### Récupérer les fichiers compilés

Une fois les jobs terminés (icône verte), les fichiers sont disponibles dans l'onglet **Releases** du repo GitHub.

### Fichiers générés

Les fichiers sont publiés directement dans la **GitHub Release** (onglet Releases du repo), pas dans les artifacts du workflow.

| Plateforme | Fichier | Notes |
|---|---|---|
| **Windows** | `*-Setup.exe` | Installateur NSIS ⇢ recommandé |
| **Windows** | `*.exe` (portable) | Aucune installation requise |
| **macOS** | `*.dmg` | Intel x64 ⇢ tourne aussi sur Apple Silicon via Rosetta 2 |
| **Linux** | `*.AppImage` | Universel, aucune installation |
| **Linux** | `*.deb` | Debian / Ubuntu |
| **Linux** | `*.rpm` | Fedora / RHEL |

### Installation macOS

Le launcher n'est pas signé avec un certificat Apple Developer. Un script d'installation est fourni pour autoriser l'app en un double-clic.

**Fichiers à télécharger :**
- `Blablastrae Launcher-x.x.x.dmg` - l'application
- `Installer-Blablastrae-macOS.zip` - le script d'installation

**Procédure :**
1. Ouvre le `.dmg` et glisse l'app dans le dossier Applications. Ferme la fenêtre du DMG.
2. Extrait le ZIP et double-clique sur `Installer Blablastrae.command`.
3. Une fenêtre Terminal s'ouvre et demande ton mot de passe macOS. Les caractères n'apparaissent pas à la saisie, c'est normal.
4. Le launcher se lance automatiquement une fois terminé.

Ces étapes ne sont nécessaires qu'une seule fois. Les lancements suivants se font directement depuis Applications.

> **Apple Silicon (M1/M2/M3/M4)** : le launcher est compilé en x64 et tourne automatiquement via Rosetta 2. Si Rosetta n'est pas installée, macOS propose de l'installer au premier lancement (gratuit, un seul clic).

### Supprimer un tag (si besoin de relancer)

Si un build a échoué et que vous voulez relancer avec le même numéro de version :

```bash
# Supprimer le tag localement
git tag -d v1.0.0

# Supprimer le tag sur GitHub
git push origin --delete v1.0.0

# Recréer et repousser
git tag v1.0.0
git push origin v1.0.0
```

# Instances multiples en parallèle

Si vous basez plusieurs launchers sur ce repo (ex : un pour "Blablaconv" et un pour "Blablavard"),
chaque launcher doit avoir un `productName` et un `appId` **uniques**, sinon le second launcher
se fermera immédiatement en croyant qu'une instance est déjà en cours d'exécution.

Dans **`package.json`** :
```json
"productName": "Blablaconv Launcher"
```

Dans **`electron-builder.yml`** :
```yaml
appId: "com.blablaconv.desktop"
```
