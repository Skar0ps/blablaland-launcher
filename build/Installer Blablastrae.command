#!/bin/bash

APP="/Applications/Blablastrae Launcher.app"

if [ ! -d "$APP" ]; then
  echo "Erreur : Blablastrae Launcher.app est introuvable dans /Applications."
  echo "Ouvre d'abord le fichier .dmg et glisse l'app dans Applications, puis relance ce script."
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi

echo "Autorisation de l'application en cours..."
echo "Ton mot de passe macOS va être demandé."

sudo xattr -cr "$APP"
if [ $? -ne 0 ]; then
  echo "Erreur lors de la suppression des attributs de quarantaine."
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi

sudo codesign --force --deep --sign - "$APP"
if [ $? -ne 0 ]; then
  echo "Erreur lors de la signature de l'application."
  read -p "Appuie sur Entree pour fermer..."
  exit 1
fi

echo "Installation terminee. Lancement de Blablastrae Launcher..."
open -a "Blablastrae Launcher"
