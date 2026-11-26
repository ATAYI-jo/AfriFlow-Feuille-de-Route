<p><img src="logo.svg" width="96" alt="Logo AfriFlow"></p>

# AfriFlow

AfriFlow est une plateforme web qui réunit une marketplace et un espace de collaboration pour les clients, partenaires, actionnaires et administrateurs du projet. Elle rassemble le suivi commercial, les échanges, les documents et la coordination des activités dans une interface adaptée aux ordinateurs et aux téléphones.

**[Accéder au site](https://afriflow.pages.dev/)** · **[Contribuer](CONTRIBUTING.md)** · **[Consulter les évolutions](https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route/commits/main/)**

Le dépôt contient le site, ses fonctions serveur, les sources des applications Android et Windows, ainsi que les tests. Le projet évolue régulièrement : la présence d'une fonctionnalité dans le code ne remplace pas sa validation dans un environnement correctement configuré.

## Fonctionnalités

| Espace | Fonctionnalités présentes dans le projet |
| --- | --- |
| Marketplace et partenaires | Catalogue, annonces, demandes de devis, parcours de commande et espaces de suivi des partenaires. |
| Messagerie | Messages internes, pièces jointes, messages urgents et intégration des notifications. |
| Documents | Navigation dans les documents Dropbox, prévisualisation et outils Word/Excel selon les droits accordés. |
| Coordination | Feuille de route, échéances, alertes, réunions et suivi des présences. |
| Comptes et administration | Authentification, récupération de compte, profils et gestion des rôles et accès. |
| Accès sur plusieurs appareils | Application web installable (PWA), sources Android et client Windows Electron. |

Les accès métier dépendent des comptes, des autorisations et des services serveur. Le prototype de mascotte 3D est un composant complémentaire du projet, situé dans [`avatar-3d/`](avatar-3d/).

## Démarrer un aperçu local

L'interface web est composée de fichiers HTML, CSS et JavaScript servis directement. Elle ne nécessite pas de commande de compilation ni d'installation npm à la racine pour être affichée.

Avec **Git** et **Python 3** disponibles :

```bash
git clone https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route.git
cd AfriFlow-Feuille-de-Route
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir ensuite [http://127.0.0.1:8000](http://127.0.0.1:8000). Sur un poste où Python s'appelle `python` ou `py`, remplacer `python3` par la commande correspondante.

Un serveur HTTP est nécessaire ; ouvrir directement `index.html` avec une adresse `file://` n'est pas le parcours de développement prévu.

### Ce que cet aperçu permet

Il permet d'inspecter l'interface et de travailler sur les fichiers locaux. Une connexion Internet reste nécessaire aux bibliothèques et services chargés à distance.

Le lancement local **ne crée pas un backend de test** : les adresses de services présentes dans le code peuvent toujours désigner l'environnement déployé. Utiliser un environnement et des comptes de test pour les parcours authentifiés ou les actions qui enregistrent des données, envoient des messages ou manipulent des documents.

Il n'existe pas de procédure d'installation entièrement autonome et sans configuration des services dans ce dépôt. Les intégrations nécessitent notamment Supabase, Dropbox, la configuration des origines et redirections d'authentification, ainsi que les paramètres de notification propres à chaque plateforme. Les guides ci-dessous détaillent les éléments déjà documentés.

## Organisation du code

| Emplacement | Rôle |
| --- | --- |
| [`index.html`](index.html), [`afriflow-core.js`](afriflow-core.js), [`afriflow-workspace.js`](afriflow-workspace.js) | Assemblage de l'interface, fonctions principales et espace de travail. |
| [`market.js`](market.js), [`market.css`](market.css) | Marketplace et parcours commerciaux. |
| [`modules/`](modules/) | Modules d'authentification, messagerie, documents, administration et collaboration. |
| [`supabase/functions/`](supabase/functions/), [`supabase/migrations/`](supabase/migrations/) | Fonctions serveur et migrations de base de données. |
| [`manifest.webmanifest`](manifest.webmanifest), [`sw.js`](sw.js) | Configuration de l'application web installable et service worker. |
| [`android/`](android/), [`desktop/`](desktop/) | Applications Android et Windows. |
| [`avatar-3d/`](avatar-3d/) | Démonstrations et intégration de la mascotte 3D. |
| [`tests/`](tests/) | Vérifications structurelles, régressions et parcours navigateur. |

La séparation en modules est progressive. Certaines fonctions partagent encore des variables globales et dépendent de l'ordre de chargement des scripts. Consulter [`MODULARISATION.md`](MODULARISATION.md) avant de déplacer ces fonctions.

## Vérifier une modification

Le [workflow qualité](.github/workflows/quality-checks.yml) utilise **Node.js 22**. Depuis la racine du dépôt :

```bash
node --test tests/*.test.cjs
```

Les parcours navigateur existants utilisent **Playwright 1.56.1** et Chromium :

```bash
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install --with-deps chromium
node --test tests/browser-smoke.cjs
```

L'installation de Chromium télécharge un navigateur et, selon le système, peut installer ses dépendances. Le script de test démarre lui-même son serveur local. Le détail des vérifications et de leurs limites figure dans [`CONTRIBUTING.md`](CONTRIBUTING.md).

Les tests structurels et les parcours anonymes ne certifient pas les droits serveur, la livraison des emails, les opérations Dropbox ou les notifications natives. Ces intégrations demandent des essais authentifiés ciblés dans un environnement de test.

## Applications Android et Windows

Le [workflow de compilation des applications](.github/workflows/build-apps.yml) produit un APK Android de test et un installateur Windows. Il contient les versions et étapes nécessaires à la compilation, dont la génération des icônes.

La compilation Android nécessite la configuration Firebase attendue par le workflow. L'APK de test utilise une signature de développement ; les conditions de distribution et de mise à jour sont décrites dans [`NATIVE_NOTIFICATIONS_SETUP.md`](NATIVE_NOTIFICATIONS_SETUP.md).

## Documentation

| Guide | Sujet |
| --- | --- |
| [Contribuer au projet](CONTRIBUTING.md) | Signaler un problème, préparer une modification et décrire ses vérifications. |
| [Marketplace et documents partenaires](MARKET_SETUP.md) | Fonctionnement du Market, stockage documentaire et configuration serveur. |
| [Notifications natives](NATIVE_NOTIFICATIONS_SETUP.md) | Configuration et limites des notifications Windows et Android. |
| [Modularisation](MODULARISATION.md) | Architecture et séparation progressive des fonctionnalités. |
| [Audit de performances](PERFORMANCE_AUDIT.md) | Constats techniques et pistes d'amélioration consignés dans le dépôt. |
| [Préparer un composant réutilisable](docs/REUSABLE_COMPONENT_PLAN.md) | Candidat retenu, périmètre d'extraction et vérifications avant une éventuelle publication séparée. |

## Participation et réutilisation

Les retours reproductibles, correctifs ciblés et améliorations de documentation sont utiles au projet. Le [guide de contribution](CONTRIBUTING.md) explique comment préparer une proposition lisible et vérifiable.

Le dépôt est public, mais **aucune licence open source explicite n'est actuellement déclarée**. Cette documentation n'accorde pas de nouvelle autorisation de réutilisation. Le périmètre du code éventuellement partagé et sa licence doivent être définis avant de présenter un composant comme une bibliothèque open source réutilisable. Voir aussi les [explications de GitHub sur les licences](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
