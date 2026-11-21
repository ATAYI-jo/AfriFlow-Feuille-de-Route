# Déploiement des profils Client, Partenaire et Actionnaire

## Comportement attendu

- Première connexion Google, OAuth ou compte existant sans profil : écran de sélection Client / Partenaire / Actionnaire.
- Client : Market uniquement, actif dès le choix.
- Partenaire : `partner_waiting` puis approbation par l'administration, `partner_approved` et portail commercial indépendant.
- Actionnaire : `shareholder_pending` puis approbation par l'administration, `shareholder_approved` et espace Journal de Bord / Feuille de Route.
- Le statut n'est pas un champ éditable par le navigateur. Toutes les autorisations sensibles passent par les politiques RLS ou Edge Functions.

## Blocage de migration identifié sur Supabase

Le 21 novembre 2026, le diagnostic agrégé relevait **11 profils historiques** en `access_mode=collaborator`, avec `requested_role=client`. Ne pas transformer ces comptes automatiquement en actionnaires. Il faut que l'administration identifie et approuve les actionnaires réels, compte par compte, avant d'activer une règle qui refuserait la collaboration aux autres.

La mise à jour ne doit pas être fusionnée avant la classification des anciens utilisateurs, la migration RLS et la mise à jour des Edge Functions. Un administrateur conserve son accès via `af_is_admin()`.

## Ordre de déploiement

1. Inventorier et valider les actionnaires historiques (sans exposer les données nominatives dans les commits). Préparer la migration de leurs profils par un opérateur disposant des droits d'administration.
2. Appliquer `supabase/migrations/20261121130000_roles_onboarding_approval.sql` et vérifier les contraintes, triggers et policies. La migration sauvegarde le statut des partenaires déjà activés.
3. Déployer les fonctions `afriflow-partner-portal`, `dropbox-view` et `dropbox-save`.
4. Tester depuis des comptes dédiés : Client, Partenaire en attente, Partenaire approuvé, Actionnaire en attente, Actionnaire approuvé, Administrateur.
5. Vérifier Google OAuth nouveau compte, email mot de passe nouveau compte, ancien compte, rafraîchissement, logout et absence de flash du Journal.
6. Après validation, fusionner la PR et contrôler le déploiement Render et les erreurs de console.

## Points de vigilance

- Les tests CI statiques et Chromium anonymes ne remplacent pas les tests OAuth et RLS réels.
- Le code JavaScript livré au navigateur ne doit contenir aucune donnée confidentielle de l'espace actionnaire : certaines valeurs de démonstration de l'ancien Journal sont encore dans `afriflow-core.js`; auditer avant publication.
- Ne jamais traiter une simple déclaration `shareholder` comme une approbation.
- Une personne ne choisit son profil qu'une fois. Les changements après création relèvent d'une procédure administrateur.

## Suppression d'un compte et nouvelle inscription

La suppression depuis Administration est une suppression du compte Supabase Auth, du profil Market et de l'état de collaboration : il ne s'agit pas simplement de retirer un bouton de navigation. L'identité supprimée ne doit plus être restaurée depuis une session locale mise en cache.

Si la même personne revient via Google, Microsoft ou e-mail et crée une nouvelle identité Supabase, son profil Market n'existe plus : l'écran de sélection Client / Partenaire / Actionnaire doit réapparaître. Les approbations antérieures ne sont pas récupérées ; une nouvelle demande de partenaire ou actionnaire est nécessaire. Un Client est dirigé vers le Market après son choix.

Attention : si la fonction administrative de suppression retourne une erreur, aucune réinitialisation ne doit être considérée comme terminée. Vérifier que l'identité Auth a réellement été supprimée avant d'affirmer que le parcours repart à zéro. Les sessions restaurées sont revalidées avec `auth.getUser()` au lieu de faire confiance uniquement au cache `getSession()`.

## Correction de la sélection Google des anciens comptes Client

L'ancienne version créait parfois un profil `client` sans demander de confirmation après un premier OAuth. Pour ne pas enfermer ces utilisateurs dans un rôle choisi par défaut :

- Migration : `selection_confirmed_at` est initialement NULL pour les profils existants, et initialisé pour toutes les nouvelles inscriptions.
- Un ancien profil `client` non confirmé voit **une seule fois** l'écran Client / Partenaire / Actionnaire après la connexion.
- Le choix met à jour le profil existant en une opération vérifiée ; Partenaire devient `partner_waiting`, Actionnaire devient `shareholder_pending`, sans privilège automatique.
- Après confirmation, le profil est verrouillé. Les anciens profils `collaborator` ne sont pas reclassés automatiquement : leur revue reste obligatoire avant la migration RLS complète.
- Le client Google déjà inscrit doit donc également voir le choix, sauf si sa sélection a déjà été confirmée dans la nouvelle version.

Le navigateur ne peut pas déduire si le rôle Client avait été choisi librement ou attribué par défaut. L'utilisateur confirme explicitement sa sélection une fois.
