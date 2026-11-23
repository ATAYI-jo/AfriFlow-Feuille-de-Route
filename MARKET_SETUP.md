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

L’IA d’images utilise le secret serveur existant `GEMINI_API_KEY` et, si besoin, `GEMINI_IMAGE_MODEL`. Elle reçoit l’original depuis Dropbox, demande une variante fidèle au produit, la replace dans Dropbox, puis la crée en statut `pending`. Elle n’est jamais rendue publique avant l’approbation manuelle par un administrateur.

Si Dropbox affiche « doit être reconnecté », le jeton d’accès a perdu son autorisation. Renouveler alors `DROPBOX_REFRESH_TOKEN` (et, si nécessaire, `DROPBOX_APP_KEY` et `DROPBOX_APP_SECRET`) dans les secrets Supabase, sans jamais les placer dans le navigateur ou le dépôt.

## Déploiement

Les migrations à appliquer dans l’ordre sont dans `supabase/migrations/`. Les deux Edge Functions sont :

- `afriflow-market-media` — publique, uniquement pour les produits actifs et leurs liens temporaires
- `afriflow-market-admin` — JWT obligatoire et contrôle de l’administrateur dans `afriflow_admins`

Après toute modification du Market, vérifier les politiques RLS et les conseillers Supabase. Les alertes déjà présentes sur les modules Push et Réunion sont antérieures au Market.


## Signalements partenaires — Dropbox comme archive documentaire

Les nouvelles **photos, vidéos et snapshots JSON des dossiers de signalement** sont envoyés à Dropbox via la fonction Supabase `afriflow-partner-dropbox`. L'interface ne reçoit jamais de jeton Dropbox. Supabase conserve les comptes, l'état des contestations et un index technique minimal afin de sécuriser les accès et les droits de l'administration.

Dossier créé à la première contestation :
```text
<racine Dropbox configurée ou /AfriFlow>/Marches/<code-pays>-<marché>/
  Partenaires/<user-id>/Signalements/<dispute-id>/
    Dossier_Signalement.json
    Photos/<uuid>.jpg
    Videos/<uuid>.mp4
```

Photos : JPEG, PNG, WebP. Vidéos : MP4 ou WebM. Maximum **3 fichiers, 25 Mio par fichier** depuis le formulaire (transfert fragmenté). La fonction crée les dossiers Dropbox selon l'attribution administrative du marché. Les consultations sont autorisées au partenaire propriétaire et aux administrateurs AfriFloW, puis fournissent des liens Dropbox temporaires. Le JSON est réactualisé après l'envoi de pièces et lors de la décision de l'administration.

Secrets serveur nécessaires : `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` si nécessaire, et l'autorisation de renouvellement disponible dans `afriflow_private_integrations` ou `DROPBOX_REFRESH_TOKEN`. Racine : `DROPBOX_PARTNER_ROOT` facultatif, sinon `DROPBOX_ROOT`, sinon `/AfriFlow`.

La table `afriflow_partner_dropbox_files` indexe les références Dropbox (RLS propriétaire/admin). Les dossiers existants dans l'ancien stockage Supabase restent accessibles en lecture et ne sont pas supprimés. Le bucket Supabase historique est conservé pour éviter toute perte. Avant la mise en exploitation, effectuer un test authentifié de création de contestation, transfert d'une photo et d'une vidéo, réouverture des pièces et décision administrateur, puis contrôler le contenu dans Dropbox. La configuration ne doit pas être présentée comme validée de bout en bout sans ce test.
