# Modèle 3D AfriFloW

Dépose **le vrai fichier** `afriflow-assistante.glb` dans ce dossier, puis ouvre :
`/avatar-3d/index.html` et clique sur **Afficher le GLB**.

Chemin exact : `avatar-3d/models/afriflow-assistante.glb`

**Aucun modèle GLB n'a été créé ni téléchargé automatiquement.**
Tant que le modèle manque (ou si WebGL est indisponible), le portrait original `avatar.jpg` reste visible.

Les fichiers `model-viewer.js`, `conversation-states.js` et `avatar-controller.js` sont préparés à partir des deux scripts Gemini fournis, avec :
- Three.js et GLTFLoader compatibles avec un site sans build (import map).
- AnimationMixer pour les clips du GLB; états idle/greeting/listening/thinking/talking.
- Morph targets par nom ou index via `setViseme(meshName, morphName, weight)`.
- Repli portrait en cas d'absence de GLB ou WebGL.
- Synthèse vocale du navigateur pour la démo, et passerelle same-origin `AFRIFLOW_SPEAK`/`AFRIFLOW_STATE`.

**Limites importantes :** les noms des animations, les visèmes et le rig doivent réellement exister dans le GLB. La synchronisation labiale exacte avec Gemini Live n'est pas implémentée. Si le GLB utilise une compression Draco/KTX2, des décodeurs supplémentaires devront être configurés.
