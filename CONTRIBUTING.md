# Contribuer à AfriFlow

Ce guide explique comment signaler un problème, documenter un parcours ou proposer une modification du projet. Une contribution utile répond à un besoin identifié et apporte des éléments qui permettent de la vérifier.

Le dépôt est public, mais aucune licence open source n'est actuellement déclarée pour le code du projet. Ce guide ne lui ajoute pas de licence. Le choix du périmètre de code éventuellement ouvert et de ses conditions de réutilisation reste à établir.

## Comprendre le projet

Commencer par le [README](README.md), puis consulter la documentation du domaine concerné :

| Domaine | Documentation et fichiers utiles |
| --- | --- |
| Organisation du code et chargement des modules | [MODULARISATION.md](MODULARISATION.md), `index.html`, `modules/` |
| Marketplace, partenaires et documents Dropbox | [MARKET_SETUP.md](MARKET_SETUP.md), `market.js`, `supabase/functions/` |
| Notifications web, Android et Windows | [NATIVE_NOTIFICATIONS_SETUP.md](NATIVE_NOTIFICATIONS_SETUP.md), `afriflow-push.js`, `android/`, `desktop/` |
| Performances et chargement | [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) |
| Vérifications automatiques | [Workflow qualité](.github/workflows/quality-checks.yml), `tests/` |

L'interface web utilise des fichiers HTML, CSS et JavaScript servis directement. Le dépôt n'a pas de `package.json` à sa racine. Le paquet Electron de l'application Windows se trouve dans `desktop/`.

## Signaler un problème

Vérifier d'abord les [issues existantes](https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route/issues) pour compléter un signalement pertinent plutôt que le dupliquer. Fournir les informations suivantes :

- La page et le parcours concernés, avec des étapes de reproduction courtes.
- Le résultat attendu et le résultat observé.
- Le navigateur, le système et la taille d'écran si le problème est visuel.
- Le contexte d'accès utile : visiteur, client, partenaire, actionnaire ou administrateur, sans identifiant personnel.
- La version ou le commit testé, si connu, et la fréquence du problème.
- Une capture anonymisée ou un message d'erreur nettoyé, lorsque cela aide à comprendre.

Utiliser des données fictives dans les exemples. Retirer les adresses personnelles, documents privés, cookies, jetons, mots de passe et liens temporaires donnant accès à des fichiers. Pour un problème de sécurité, éviter de publier des données sensibles ou des étapes exploitables dans une issue publique ; convenir d'un canal privé avec le responsable du projet.

## Préparer une modification locale

Avec un clone du dépôt, créer une branche pour le changement :

```bash
git clone https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route.git
cd AfriFlow-Feuille-de-Route
git switch -c fix/description-du-probleme
```

Une personne sans droit d'écriture peut préparer sa branche dans son propre fork et proposer une pull request vers le dépôt d'origine.

### Aperçu de l'interface web

Depuis la racine du dépôt, avec Python 3 installé :

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir ensuite [http://127.0.0.1:8000](http://127.0.0.1:8000). Utiliser un serveur HTTP permet de charger correctement les fichiers et modules ; ouvrir directement `index.html` ne reproduit pas cet environnement.

Ce serveur fournit uniquement les fichiers du navigateur. Il ne crée pas un environnement Supabase, un compte Dropbox, une configuration OAuth ou un service d'envoi de notifications. Certaines bibliothèques et fonctions dépendent d'un accès réseau et de services externes. Le code conserve les références aux services configurés pour AfriFlow : servir la page localement ne constitue pas un environnement métier isolé.

Pour les essais authentifiés ou les opérations qui écrivent des données, utiliser un environnement de test configuré et des comptes de test adaptés. Les secrets serveur restent dans la configuration des services concernés ; ils ne doivent pas être copiés dans les fichiers du navigateur, les commits ou les captures.

## Vérifier une modification

### Contrôles de syntaxe, de structure et de régression

La CI utilise Node.js 22. Depuis la racine du dépôt, lancer la même commande :

```bash
node --test tests/*.test.cjs
```

Cette commande exécute les fichiers qui se terminent par `.test.cjs`. Elle couvre notamment la syntaxe JavaScript, la présence des modules, leur ordre de chargement et plusieurs règles de régression. Elle ne lance pas la suite navigateur `browser-smoke.cjs`.

### Vérifications navigateur existantes

Le [workflow qualité](.github/workflows/quality-checks.yml) utilise Playwright 1.56.1 et Chromium. Pour reproduire sa préparation sous un environnement Linux compatible :

```bash
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install --with-deps chromium
node --test tests/browser-smoke.cjs
```

L'installation télécharge le navigateur et peut nécessiter l'installation de dépendances système. La suite démarre elle-même son serveur local ; aucun serveur Python séparé n'est nécessaire pour cette commande. Elle teste notamment le démarrage anonyme, l'affichage mobile et des interactions avec des données simulées. Elle ne requiert pas d'identifiants de production, mais le chargement de la page peut effectuer des requêtes vers les services externes configurés.

Ces vérifications ne valident pas à elles seules la connexion avec de vrais comptes, les autorisations du serveur, les échanges Dropbox, la réception d'un e-mail, les notifications natives ou une transaction complète. Pour un changement qui touche ces parcours, décrire les essais effectués dans l'environnement de test et les limites restantes.

### Adapter la vérification au changement

- **Documentation** : relire les commandes, les liens relatifs, les noms de fichiers et la cohérence avec le code actuel.
- **Interface** : vérifier le parcours concerné sur un petit écran et sur ordinateur, ainsi que la navigation au clavier si des contrôles changent.
- **Permissions ou comptes** : tester les accès autorisés et refusés avec les rôles concernés ; un contrôle visuel côté navigateur ne remplace pas l'autorisation côté serveur.
- **Documents, messagerie ou notifications** : utiliser des fichiers et destinataires de test, puis vérifier l'ouverture, les droits et le résultat reçu selon le changement.

Ajouter un test ciblé lorsqu'il permet de reproduire un défaut significatif ou de protéger un comportement modifié. Pour une correction documentaire, une vérification des liens et des instructions suffit généralement.

## Préparer une pull request

Garder une modification cohérente et assez limitée pour être comprise et revue. Dans sa description, préciser :

1. Le problème ou le besoin, avec le lien vers l'issue lorsqu'elle existe.
2. Le comportement obtenu et les fichiers ou domaines concernés.
3. Les commandes et parcours réellement vérifiés, avec leur résultat.
4. Les limites connues et les éventuels prérequis de configuration.

Pour une modification visuelle, des captures avant et après facilitent la revue. Pour un changement de schéma ou de fonction serveur, expliquer l'ordre de mise en place et les effets attendus. Les instructions de domaine dans le dépôt restent utiles pour préparer ces vérifications.

Privilégier les corrections utiles, les exemples reproductibles et la documentation qui lève une difficulté réelle. Ne pas fractionner artificiellement un changement ou produire des propositions répétitives pour augmenter un compteur de contributions.

## Applications Android et Windows

La compilation native a ses propres outils et prérequis. Le fichier [.github/workflows/build-apps.yml](.github/workflows/build-apps.yml) décrit les versions et commandes utilisées : Java 17, Gradle 8.9 et SDK Android pour Android ; Node.js 22 et Electron Builder pour Windows. La configuration Firebase Android et la génération des icônes font également partie de ce workflow.

Les commandes de vérification web ci-dessus ne compilent pas ces applications. Si une modification concerne `android/` ou `desktop/`, indiquer séparément les builds et essais natifs réalisés.
