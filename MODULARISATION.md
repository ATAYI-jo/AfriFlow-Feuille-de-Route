# AfriFloW : modularisation progressive

Objectif : séparer les fonctionnalités sans rompre les usages existants (collaborateurs, clients et administrateurs).

## État initial
- Authentification : intégrée à `afriflow-core.js`.
- Market : déjà isolé dans `market.js` et `market.css`.
- Documents : fonctions dispersées dans `index.html`, `afriflow-workspace.js` et les fichiers `document-*.js`.
- Messagerie : présente dans le code intégré de `index.html` et dans le workspace.
- Administration : répartie entre plusieurs fichiers.
- `index.html` reste un point de concentration de logique et de styles.

## Étape 1 — Garde-fous (cette branche)
- Conserver les scripts existants et leur ordre de chargement.
- Installer des tests automatiques sans dépendances npm pour la syntaxe des principaux JS, les fichiers essentiels, les références de scripts et la PWA.
- Exécuter ces tests sur chaque pull request et sur les pushes de la branche de refactorisation.
- Aucun changement de droits, de configuration Supabase, de schéma SQL, de clés Dropbox ni du comportement de l'application.

## Étapes suivantes — une extraction par PR
1. **Authentification** : isoler les fonctions en module `modules/auth/` avec contrat explicite; vérifier connexion, récupération de mot de passe, déconnexion, redirections, sessions et permissions côté serveur.
2. **Messagerie** : isoler `modules/messaging/`; vérifier lecture, envoi, pièces jointes, permissions et messages non lus.
3. **Documents** : réunir `modules/documents/`; vérifier upload, téléchargements et prévisualisations Word/Excel/PDF, liens Dropbox expirés, droits.
4. **Administration** : isoler `modules/admin/`; vérifier les rôles, refus d'accès et gestion des demandes.
5. **Market** : découper progressivement le fichier déjà autonome en catalogue, panier, images et commandes; vérifier affichage invité et connecté.

## Critères d'acceptation d'une extraction
- Le contrat global utilisé par le reste du code est conservé pendant la migration.
- Aucun secret n'est introduit dans le code public.
- Des tests unitaires et de parcours navigateur (Playwright conseillé) couvrent les comportements déplacés.
- Les erreurs console et réseau sont vérifiées sur ordinateur et mobile.
- Le déploiement ne s'effectue qu'après vérifications vertes et validation manuelle.

## Important : véritable blocage avant déploiement
Ce workflow GitHub Actions **ne bloque pas à lui seul** le déploiement automatique Render.
Configurer Render pour déployer uniquement après une CI verte, ou gérer le déploiement par GitHub Actions avec un job `needs: [static-and-regression, e2e]`. Protéger également la branche main en exigeant le check `JavaScript syntax and architecture` avant fusion. Les tests actuels sont structurels et ne remplacent pas les tests de navigation ni les tests Supabase/Dropbox.

## Étape 2 — Extraction conservatrice (en cours)
- `modules/messaging/internal-messaging.js` : bloc interne de messagerie extrait depuis `index.html`.
- `modules/documents/document-viewer.js` : bloc de prévisualisation extrait.
- `modules/auth/oauth-icons.js` : rendu des icônes OAuth extrait.
- Ordre de chargement des scripts synchrones préservé; code source interne conservé sans changement de logique.
- Tests structurels renforcés pour vérifier ces trois points d'entrée et empêcher leur duplication.
- Le Market reste dans `market.js` : aucune modification à ce stade.
- **Validation restante** : CI GitHub Actions verte, tests fonctionnels dans un navigateur, contrôle du chargement des fichiers JavaScript et du parcours authentification/documents/messagerie.

## Étape 3 — Modules supplémentaires
- `modules/documents/word-editor.js` : éditeur Word séparé du HTML.
- `modules/admin/access-controls.js` : personnalisation de la connexion et contrôles d'accès d'interface extraits.
- Aucun déplacement du contrôle réel des permissions Supabase/RLS : l'autorisation reste à vérifier côté serveur.
- Le chargement synchrone original a été conservé pour limiter les risques de régression.
- Tests de présence et de non-duplication ajoutés; aucune fusion automatique.
