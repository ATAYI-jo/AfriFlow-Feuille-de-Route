# Correctifs intégrables dans le site AfriFloW

## Contenu
- index.html : copie de ton index fourni, corrigée pour éviter les deux gestionnaires Live concurrents et garder le logo visible.
- logo.png : ton logo exact, à la racine.
- avatar-3d/ : la version 3D interactive, séparée du Live vocal (aucun WebGL requis pour démarrer la conversation).

## Installation prudente
1. Sauvegarde ton dépôt GitHub ou crée une branche.
2. Vérifie que le `index.html` fourni correspond à ta version actuelle. Si ton dépôt a changé depuis l'export, il faut fusionner les modifications plutôt qu'écraser le fichier.
3. Téléverse les fichiers du ZIP à la racine du dépôt GitHub.
4. Vérifie que `https://TON-SITE/logo.png` et `https://TON-SITE/avatar-3d/index.html` fonctionnent.
5. Recharge en vidant le cache (Ctrl+F5).
6. Dans le chatbot, clique sur « Avatar 3D ». Les nouvelles réponses AfriFloW seront lues par l'avatar quand la lecture vocale du chatbot n'est pas déjà activée.

## Live vocal
Le script WebGL concurrent a été retiré ; le premier contrôleur Live et son animation Canvas 2D restent.
Cela corrige la dépendance à WebGL à l'origine de l'erreur affichée, mais ne garantit pas la réussite de la connexion Gemini Live (clé, configuration, jeton, modèle, restrictions du navigateur, permissions du micro et quota restent à vérifier).
Le `admin-ai` Supabase n'est pas modifié.
Si l'erreur persiste, regarder Console et Réseau (WebSocket et `admin-ai`) sans divulguer de jeton.

## Limites de l'avatar
Le 3D procédural est une interprétation du personnage ; ressemblance exacte non garantie, et lèvres non synchronisées phonème par phonème. L'avatar emploie la synthèse vocale locale en dehors du mode Gemini Live.

## Important
Tu as fourni plusieurs versions du code. Ce paquet est fondé sur « Texte collé (3).txt » : tester sur une branche avant de remplacer le site publié.
