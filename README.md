# Launcher Blablaland (Public)

Launcher basé sur Electron permettant de jouer à Blablaland (ou tout autre jeu flash présent sur un site web).

Basé à l'origine sur le launcher de [Panfu](https://github.com/teampanfu/panfu-desktop).

## Prérequis

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
- **Windows & Linux** — sur un runner Ubuntu avec Wine (via Docker)
- **macOS** — sur un runner macOS natif (nécessaire pour compiler `.dmg`)

### Suivre le build

Une fois le tag poussé, allez dans l'onglet **Actions** de votre repo GitHub. Vous verrez le workflow **"Build Release"** en cours d'exécution. Chaque job prend environ 5-10 minutes.

### Récupérer les fichiers compilés

Une fois les jobs terminés (icône verte), cliquez sur le workflow run, puis scrollez jusqu'à la section **Artifacts** en bas de page pour télécharger les zips.

### Fichiers générés

| Plateforme | Artifact GitHub Actions | Formats |
|---|---|---|
| **Windows** | `release-builds-windows` | `.exe` (installateur NSIS x64 + x86) + `.exe` (portable x64) |
| **Linux** | `release-builds-linux` | `.AppImage`, `.deb`, `.rpm` en x64 |
| **macOS** | `release-builds-macos` | `.dmg` + `.zip` en Intel (x64) et Apple Silicon (arm64) |

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

## Instances multiples en parallèle

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
