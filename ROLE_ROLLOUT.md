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
