# AfriFloW — avatar 3D animé

Projet prêt à déposer dans un dépôt GitHub Pages. Il contient un personnage **3D procédural réel**, rendu et animé avec Three.js, et le **logo original** fourni par AfriFloW.

## Fichiers
- `index.html` : page d'accueil et contrôle vocal.
- `style.css` : interface responsive.
- `avatar.js` : personnage 3D en géométries, animations et voix.
- `assets/logo-afriflow.png` : logo original, placé comme texture sur le polo.
- `assets/reference-mascotte.png` : image de référence, disponible dans l'onglet « Portrait fidèle ».

## Mettre sur GitHub Pages
1. Décompresser l'archive.
2. Ouvrir ton dépôt GitHub > **Add file** > **Upload files**.
3. Déposer le contenu du dossier (fichiers à la racine du dépôt, dossier `assets` compris) ; valider **Commit changes**.
4. Dans **Settings > Pages**, sélectionner **Deploy from a branch**, branche `main`, dossier `/(root)` et enregistrer.
5. Ouvrir l'URL GitHub Pages. Le moteur Three.js se charge depuis jsDelivr, une connexion Internet est donc nécessaire.

## Connecter le chatbot
Quand ton chatbot répond, exécuter dans la page :

```js
window.AfriFlowAvatar.speak(reponseDuChatbot);
```

Pour arrêter :

```js
window.AfriFlowAvatar.stop();
```

L'API expose également `setIdle(true/false)` et `setLipAnimation(true/false)`.

## Ce que fait réellement le projet
- Modèle **3D calculé en temps réel**, tournable horizontalement à la souris ou au doigt.
- Mouvements subtils de tête, corps, bras et clignements.
- Mouvement de bouche pendant la synthèse vocale française du navigateur.
- Le logo exact fourni est chargé comme texture sur la poitrine.
- Mode « Portrait fidèle », qui affiche l'image d'origine **sans mouvement**.

## Limites importantes
Ce modèle procédural est une **interprétation 3D** de la mascotte, pas sa reconstruction identique au pixel près. Ce n'est **pas** encore un personnage de studio créé avec maillage sculpté, squelette professionnel et blendshapes. La synchronisation labiale est **approximative** (durée de la parole), pas mot à mot ou phonème à phonème. Le fichier n'est pas un `.glb`/`.vrm` exportable : le personnage est créé à l'exécution par JavaScript. Pour un résultat cinéma 100 % proche de l'image avec visèmes, la suite est la modélisation/rigging dans Blender, la création de blendshapes, puis l'intégration audio-visèmes.

Pour de vraies formes de bouche synchronisées, connecter un service TTS qui renvoie des horodatages de visèmes et un modèle disposant des morph targets correspondants.

## Test local
Servir le dossier via un serveur web local :

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000. L'ouverture par `file://` peut bloquer les modules ES ou textures selon le navigateur.
