# Audit des dépendances et du chargement — AfriFloW

Date : 21 novembre 2026. Périmètre : branche `refactor/modularisation-et-tests`, analyse statique des fichiers publics. **Aucune mesure Lighthouse ni test navigateur authentifié n'a été réalisé.**

## Conclusions confirmées dans le code

1. `index.html` est passé de 369 075 à 198 759 caractères après l'extraction de 12 blocs. Cette réduction est un gain d'organisation, pas une preuve de baisse du trafic réseau : les scripts sont encore chargés.
2. Le cœur (`afriflow-core.js`, environ 77 Ko) et l'espace de travail (`afriflow-workspace.js`, environ 59 Ko) sont chargés synchroniquement. Le client Supabase est chargé au même endroit. Leur ordre est important pour les modules qui lisent `window.__sb`, `window.__TABLE`, `window.AFRI`, `window.USER_ROLE` ou `window.loggedUserEmail`.
3. `market.js` représente environ 103 Ko et utilise déjà `defer`. Il installe `window.AfriMarket` et une initialisation à `DOMContentLoaded`. **Ne pas** le passer arbitrairement en `async` ou en chargement différé sans revoir les transitions intro/Market.
4. Les deux éléments vidéo de l'introduction référencent `afriflow-intro-white.mp4` avec `preload="auto"`. Le fichier référencé fait environ 5,2 Mo dans le dépôt. Le navigateur peut réutiliser les requêtes, mais il faut mesurer le coût du téléchargement, le LCP et l'impact mobile avant de modifier la lecture.
5. L'éditeur de documents, la messagerie et l'assistant sont désormais dans des fichiers distincts, mais plusieurs blocs s'initialisent au chargement du document : les déplacer en `defer` ou `import()` sans contrat d'initialisation présente un risque fonctionnel.
6. Certains scripts utilisent des mutations DOM, des écouteurs ou des pollings périodiques. Avant le chargement différé, identifier les conditions de lancement, les nettoyages et les cas multi-connexion.

## Matrice de dépendances (lecture statique)

| Composant | Entrées / dépendances visibles | Risque de différer |
| --- | --- | --- |
| Noyau et workspace | DOM, stockage, état de session | Élevé |
| Comptes | Supabase, table d'état, rôle, listeners | Élevé |
| Messagerie | Session, Supabase, Dropbox, rôle | Élevé sans adaptateur |
| Market | DOMContentLoaded, session, API AfriMarket | Élevé sans orchestrateur |
| Explorateur Dropbox et lecteur | UI documents, session, Supabase | Moyen à élevé |
| Assistant chat | DOM, services IA, événements et voix | Moyen à élevé |
| Rendu mathématique | Messages IA, bibliothèques KaTeX à la demande | Moyen |
| Réunions et feuille de route | Session, DOM, données distantes | Moyen |
| Fond animé | DOM, rafraîchissement et préférences | Moyen |

## Plan de performance, par étapes sécurisées

1. **Garde-fous CI (ajoutés)** : vérifier la présence des scripts locaux, parser les scripts inline, contrôler le chargement unique du Market et refuser les retours au HTML monolithique de plus de 225 Ko. Ce budget concerne uniquement l'enveloppe HTML, pas le poids total réseau.
2. **Mesures navigateur à effectuer** : capturer sur mobile et desktop le LCP, l'INP, le CLS, les requêtes JS/CSS, la taille transférée de la vidéo, les erreurs réseau, l'usage mémoire et la console. Faire une mesure à froid et une à chaud, connecté et invité.
3. **Contrats de modules** : introduire des fonctions `init()` / `dispose()` explicites, sans multiplier les hooks `window.onRole` ; maintenir un adaptateur compatible avec les appels existants.
4. **Premier candidat de lazy-loading** : l'éditeur Word et les dépendances de prévisualisation, uniquement après tests de parcours et avec fallback de téléchargement.
5. **Deuxième candidat** : ressources lourdes de l'assistant (voix, mathématiques, avatar), au premier usage après vérification des événements.
6. **Market** : garder son initialisation différée actuelle jusqu'à ce que le routage d'entrée (nouveau visiteur, client, collaborateur) soit testé.
7. **Déploiement** : rendre le check CI obligatoire pour les PR; publier sur Cloudflare Pages après validation du commit.

## Critères de non-régression

- Intro et ouverture du Market chez un visiteur; accès au Market depuis le workspace.
- Connexion, récupération de mot de passe, déconnexion, reconnexion, rôle admin vs collaborateur.
- Affichage Dropbox, expiration des liens, édition et téléchargement des documents.
- Messagerie et pièces jointes, notification d'appel et notifications push.
- Assistant IA : chat, pièces jointes, voix et rendu mathématique sur mobile.

Les tests statiques sont nécessaires, mais **ne démontrent pas** l'absence de régression dans le navigateur.

## Vérification supplémentaire avant fusion
- CI enrichie d'un test Playwright Chromium en vue mobile (390 × 844).
- Sert la branche localement sans identifiants et contrôle le chargement des scripts locaux, les points d'entrée et la structure de démarrage anonyme.
- Le test de navigateur ne remplace pas la validation des parcours connectés Supabase/Dropbox, ni un audit Lighthouse avec mesures LCP/INP/CLS.
- Lancer ce contrôle avec les tests statiques avant toute fusion, et corriger les échecs relevés.

## Premier chargement à la demande — Éditeur Word
- `index.html` charge désormais le petit adaptateur `modules/documents/word-editor-loader.js` au lieu de `word-editor.js`.
- L'adaptateur publie `window.dvWordEdit`, `window.dvPerm` et `window.dvTogglePerm` dès le chargement afin de préserver les appels existants.
- `word-editor.js` est chargé une seule fois lors du premier appel. En cas d'échec, `dvPerm` répond `false` (ne jamais autoriser par défaut).
- Un test navigateur vérifie l'absence du script métier au démarrage et son injection à la première sollicitation.
- Le parcours connecté de modification Word et les permissions réelles nécessitent encore un test manuel avec un compte de test.
