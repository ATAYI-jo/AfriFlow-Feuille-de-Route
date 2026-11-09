# Avatar 3D AfriFloW

Ce dossier contient le prototype 3D de la mascotte.
- `index.html` : page de démonstration autonome
- `avatar.js` : moteur Three.js, animation et voix
- `style.css` : interface

Les images restent **à la racine** du dépôt :
- `../logo.png` : logo AfriFloW original sur le polo et dans l'en-tête
- `../avatar.jpg` : portrait de référence

La page principale du site reste `/index.html`. Le chatbot existant ouvre cette page dans une iframe via `avatar-3d/index.html`.

## Vérification
Ouvrir `/avatar-3d/index.html`. Si le site héberge seulement la racine et renvoie Not Found, il faut configurer le serveur Render pour rendre les fichiers statiques du sous-dossier accessibles. Les chemins GitHub ne suffisent pas si Render ne les sert pas.

La création WebGL demande l'accélération graphique. Si elle échoue, la démo 3D peut rester vide ; la conversation Live doit être indépendante de cette démo.

Cette réalisation est un modèle procédural Three.js, **pas** un GLB/VRM riggé identique à l'image source. La synchronisation labiale est approximative.
