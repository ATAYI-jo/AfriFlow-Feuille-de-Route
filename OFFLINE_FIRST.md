# Offline First — phase 1 (fondation)
Cette phase fournit un écran de secours public précaché, un test de disponibilité de l'hébergement, et un retour automatique depuis cet écran. Elle ne conserve ni données privées ni réponses API. Les notifications push restent actives. L'indicateur sur l'application ouverte ne confirme pas que Supabase ou Dropbox sont disponibles.
 
## Suite nécessaire avant un mode métier complet
- Vérifier la session réelle et l'identité sur chaque appareil ; définir une durée d'accès local et traiter révocation/déconnexion.
- IndexedDB par identifiant utilisateur, cache de données explicitement autorisé, migration et purge sur déconnexion.
- Outbox par opération autorisée, identifiants d'idempotence vérifiés côté serveur, gestion des conflits et reprises après erreurs. Ne jamais rejouer arbitrairement les requêtes POST.
- Adapter messagerie, alertes, documents et marketplace individuellement ; paiements/permissions/validations restent en ligne.
- Tester mode avion, réouverture, reconnexion, changements de compte, expiration de session, doublons, conflits, iOS PWA et wrappers Android/Windows. Le stockage navigateur peut être évincé.
- Ne pas activer en production avant tests CI et validation sur appareils. Aucun stockage de secret ou donnée privée n'est introduit ici.

## Phase 2 — messagerie texte
File IndexedDB par UUID Supabase, clé de message stable, vérification de la copie envoyée avant réessai, insertion atomique existante et RLS revalidée au retour du réseau. Dossier En attente, suppression explicite, reprise en premier plan. Annuaire conservé en mémoire pour le compte courant uniquement. Pas de pièces jointes hors ligne ni d’accès privé au démarrage hors ligne ; le stockage local des messages n'est pas chiffré par l'application. Tests de structure ajoutés ; tests réels multi-appareils requis. Déconnexion explicite confirme l'effacement des messages en attente. Ne pas déployer sans validation.
