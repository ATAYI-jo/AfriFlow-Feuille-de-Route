# Préparer un paginateur de documents réutilisable

## Décision proposée

Le premier candidat à extraire est le **contrôleur de pagination de documents** actuellement défini par `createPager` dans [document-viewer.js](../modules/documents/document-viewer.js), avec les styles nécessaires de [afriflow-core.css](../afriflow-core.css).

Ce document est une étude de préparation. Aucun composant autonome n'est encore livré, aucune licence n'est attribuée et le fonctionnement du site n'est pas modifié par cette note.

L'examen porte sur le commit [`0d566e262d9b1037b9f96d512b6fa811f23fe5fd`](https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route/tree/0d566e262d9b1037b9f96d512b6fa811f23fe5fd), le 26 novembre 2026. Les constats ci-dessous proviennent de la lecture du code ; ils ne constituent pas une validation des parcours en production.

## Besoin auquel le composant pourrait répondre

Une application qui possède déjà un moteur de rendu de documents peut avoir besoin de commandes communes : page précédente et suivante, état de pagination, clavier, geste tactile et affichage en plein écran. Un petit contrôleur indépendant pourrait fournir cette interface pendant que l'application conserve la récupération et le rendu des pages.

La valeur recherchée est une navigation intégrable dans plusieurs interfaces, avec un cycle de vie explicite et des comportements vérifiables. L'intérêt pour d'autres projets reste à confirmer avec des exemples d'intégration et des retours extérieurs.

## Comparaison des candidats examinés

| Candidat | Constats dans le code | Décision |
|---|---|---|
| Visualiseur de documents complet | Récupération via `window.__sb`, fonction serveur `dropbox-view`, état partagé, gestion des rôles, édition, plusieurs bibliothèques de conversion et sélecteurs propres au site. | Périmètre trop large pour une première extraction. |
| Contrôleur `createPager` du visualiseur | Reçoit un conteneur et une fonction de dessin ; gère navigation, statut, gestes et plein écran. Aucun accès à la base ni à Dropbox à l'intérieur de cette fonction. | **Candidat prioritaire**, à détacher des styles et du cycle de vie actuels. |
| [Urgence des documents](../document-urgency.js) | Lit et écrit l'état partagé ; dépend des comptes, des rôles, du document ouvert et des notifications AfriFlow. | À conserver dans l'application pour le moment. |
| [Ouverture de messages dans l'application](../modules/messaging/app-link.js) | Format d'identifiant, protocole `afriflow`, nom de paquet Android, détection de plateforme et éléments de marque spécifiques. | Nécessite une généralisation et des essais sur appareils ; moins adapté à une première extraction. |
| [Sélecteur de pays](../afriflow-countries.js) | Petit module sans accès réseau, mais libellés français, liste embarquée et sortie HTML imposée. | Extraction plus simple ; utilité et maintenance de la liste à justifier avant d'en faire un projet séparé. |

## Périmètre de la première version

Le composant autonome proposerait :

- Un conteneur de page et des commandes précédent/suivant.
- Un statut de type « Page 2 sur 8 », avec libellés configurables.
- Une navigation au clavier limitée au contexte du composant.
- Un geste horizontal facultatif, préservant le défilement vertical et le zoom.
- Un plein écran facultatif, avec repli en boîte de dialogue lorsque cette solution est disponible et adaptée.
- Une méthode explicite de destruction des écouteurs et des observateurs.
- Un traitement des rendus asynchrones qui empêche une ancienne page de remplacer la page demandée plus récemment.

La récupération des fichiers, l'authentification, les autorisations, les chemins Dropbox, l'édition, les courriels et le traitement PDF/Word/Excel resteraient dans les applications qui l'utilisent. Le composant ne garantirait ni la sécurité d'un format documentaire ni la fidélité de sa conversion.

## Dépendances à séparer

### Code de navigation

La fonction actuelle utilise `document`, `window`, les événements clavier et tactiles, `IntersectionObserver`, `MutationObserver`, l'API Fullscreen et un élément `dialog`. L'extraction devra vérifier la disponibilité des fonctions facultatives et prévoir une dégradation simple lorsque l'une manque.

Le helper `onDetach` observe aujourd'hui le parent et le grand-parent du conteneur. Le futur contrat devra fonctionner avec un conteneur initialement détaché et permettre à l'application d'appeler `destroy()` sans dépendre de cette structure précise du DOM.

### Styles

Les classes `.dvp-nav`, `.dvp-stage` et `.dvp-full-dialog` sont définies dans la feuille principale. Certaines règles dépendent de `#dvView`, des variables de thème et des boutons flottants d'AfriFlow. La feuille autonome devra fournir des valeurs par défaut et ne contenir que des sélecteurs appartenant au composant.

Les adaptations du site, notamment le masquage de ses propres boutons flottants pendant la lecture, resteraient dans sa feuille de style. Les styles de rendu PDF et de pagination Word seraient traités séparément des commandes de navigation.

### Bibliothèques et provenance

Le visualiseur complet charge PDF.js, Mammoth et SheetJS depuis un CDN. Ces bibliothèques ne sont pas nécessaires au contrôleur de navigation et ne seraient pas embarquées dans sa première version.

La provenance et les droits sur la portion de code extraite, les icônes éventuelles et les exemples devront être examinés avant de lui attribuer une licence. Le dépôt public actuel ne comporte pas de licence explicite ; cette note ne modifie pas ce statut. Une licence choisie pour un futur composant devra désigner clairement les fichiers concernés.

## Contrat d'API proposé

Le contrat ci-dessous décrit un objectif d'implémentation ; les fonctions illustrées n'existent pas encore dans un paquet autonome.

```js
const pager = createDocumentPager(host, {
  pageCount: 12,
  labels: {
    region: "Aperçu du document",
    previous: "Page précédente",
    next: "Page suivante",
    status: (page, total) => `Page ${page} sur ${total}`
  },
  fullscreen: true,
  async renderPage({ page, signal }) {
    // L'application produit un Node pour cette page.
    // Elle propage l'annulation au moteur de rendu lorsque possible.
    return renderApplicationPage(page, { signal });
  }
});

await pager.goTo(1);
await pager.goTo(3);
await pager.setPageCount(8);
pager.destroy();
```

Le composant serait responsable de l'insertion du résultat de `renderPage`. Il vérifierait que le rendu est toujours le plus récent avant de remplacer le contenu. Une fonction de rendu ne devrait donc pas modifier directement le DOM déjà affiché.

Les comportements à définir et documenter dans la première implémentation sont les suivants :

- Les numéros de page sont des entiers commençant à 1 ; zéro page correspond à un état vide explicite.
- Une navigation hors des limites conserve la page en cours.
- Une réduction du nombre de pages réajuste la page courante de manière déterministe.
- Une erreur de rendu conserve un état compréhensible et permet de réessayer.
- La destruction annule les travaux en cours, libère les écouteurs et rend inoffensives les réponses tardives.
- Plusieurs instances coexistent sans identifiants fixes ni état global partagé.

## Vérifications à prévoir

| Situation | Résultat attendu |
|---|---|
| Zéro, une ou plusieurs pages | État vide défini ; commandes pertinentes ; aucune page négative ou hors limites. |
| Navigation rapide pendant un rendu lent | Seule la dernière navigation valide devient visible. |
| Erreur du moteur de rendu puis nouvelle tentative | Message compréhensible et récupération sans recréer toute l'application. |
| Clavier dans un champ de saisie placé dans le contenu | Les flèches restent disponibles pour la saisie et ne changent pas la page. |
| Navigation clavier dans les commandes du paginateur | Focus visible, libellés explicites et statut cohérent. |
| Balayage vertical, horizontal et plusieurs doigts | Défilement et zoom préservés ; changement de page uniquement pour le geste prévu. |
| Deux paginateurs sur une même page | États, événements et destructions indépendants. |
| Plein écran indisponible ou refusé | Repli fonctionnel ou commande désactivée avec comportement documenté. |
| Fermeture du dialogue par Échap | Contenu remis à sa place et focus restauré de manière prévisible. |
| Suppression du conteneur pendant un rendu ou un dialogue | Nettoyage complet, sans réinsertion de contenu détaché. |
| Petit écran, agrandissement du texte, changement d'orientation | Commandes utilisables et contenu sans débordement des contrôles. |
| Préférence de réduction des animations | Animations facultatives désactivées ou adaptées. |

Les [tests d'architecture](../tests/architecture.test.cjs) actuels vérifient notamment la syntaxe, l'existence des scripts et leur ordre. Le [test navigateur anonyme](../tests/browser-smoke.cjs) couvre le chargement de l'application et certains parcours du shell. Ces vérifications ne démontrent pas à elles seules les comportements du tableau ; une suite ciblée et une vérification manuelle au clavier seraient nécessaires pour l'extraction.

## Étapes proposées

1. **Définir le besoin et la licence envisagée.** Confirmer un cas d'utilisation extérieur à AfriFlow, les fichiers concernés et les droits de réutilisation souhaités. Préparer un exemple avec des données synthétiques.
2. **Construire le prototype isolé.** Réaliser le contrôleur et sa feuille de style dans un espace de travail séparé. L'exemple doit fonctionner sans compte, sans appel réseau et sans configuration d'AfriFlow.
3. **Vérifier le contrat.** Couvrir les limites de pagination, les courses de rendu, le nettoyage et les interactions ; documenter les navigateurs effectivement vérifiés.
4. **Préparer l'adaptateur AfriFlow.** Relier le prototype au rendu existant dans une branche dédiée et vérifier les documents de démonstration. La base de données, les droits d'accès et la récupération Dropbox restent gérés par l'application.
5. **Évaluer une publication indépendante.** Préparer la documentation d'installation, la licence retenue, les limites connues et une première version reproductible. Recueillir des retours et corriger les problèmes observés avant d'élargir le périmètre.

Une publication indépendante, des utilisateurs externes ou une adoption par d'autres projets ne sont pas établis par cette étude. Les preuves utiles seront les intégrations réelles, les retours documentés et les corrections maintenues dans le temps.
