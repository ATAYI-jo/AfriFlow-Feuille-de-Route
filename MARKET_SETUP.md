# AfriFloW Market — exploitation

## Fonctionnement

- Le visiteur arrive sur le **Market** après l’introduction.
- Un compte existant conservé dans `afriflow_state` garde son espace collaborateur et reçoit l’entrée **Market** dans la barre latérale.
- Une personne qui choisit **Client** reste dans le Market après connexion. Les choix **Actionnaire** et **Partenaire** sont des intentions : ils ne donnent ni droits collaborateur ni droits d’édition. Partenaire affiche la page d’attente.
- Les produits sont invisibles au public jusqu’à leur publication par un administrateur.

## Images et Dropbox

1. Ouvrir **Market** depuis un compte administrateur.
2. Envoyer une photo originale et renseigner le produit. Il arrive en brouillon et est stocké dans Dropbox.
3. Publier le produit après vérification.
4. Ajouter les variantes, les vérifier puis les approuver.

La fonction publique retourne un lien Dropbox temporaire pour l’original ou, à chaque heure, une variante **approuvée**. Elle ne crée jamais une image pendant la visite. Sans variante approuvée, elle revient à l’original.

## Variables serveur

Les fonctions utilisent des secrets Supabase existants et ne les exposent jamais au navigateur :

- `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_ROOT` (déjà utilisé par les fonctions AfriFloW)
- `DROPBOX_MARKET_ROOT` — recommandé, par exemple `/AfriFlow/Market`
- `AFRIFLOW_ALLOWED_ORIGINS` — liste d’origines séparées par des virgules pour la production et la préproduction.

Le panneau IA est volontairement opérationnel sans prétendre générer quoi que ce soit. Il indique l’absence de configuration et journalise une demande avec l’état `configuration_missing`. Avant de connecter un fournisseur, définir `AFRIFLOW_IMAGE_AI_URL` et `AFRIFLOW_IMAGE_AI_KEY`, puis relier un traitement serveur à la file `afriflow_market_variant_jobs`. Toute sortie doit être vérifiée et ajoutée comme variante avant approbation.

## Déploiement

Les migrations à appliquer dans l’ordre sont dans `supabase/migrations/`. Les deux Edge Functions sont :

- `afriflow-market-media` — publique, uniquement pour les produits actifs et leurs liens temporaires
- `afriflow-market-admin` — JWT obligatoire et contrôle de l’administrateur dans `afriflow_admins`

Après toute modification du Market, vérifier les politiques RLS et les conseillers Supabase. Les alertes déjà présentes sur les modules Push et Réunion sont antérieures au Market.
