# Migration AfriFloW vers Cloudflare Pages

## État constaté le 22 novembre 2026
- Deux sites Render suspendus avec motif billing / Monthly Quota Exceeded.
- Derniers déploiements GitHub réussis. Ne pas supprimer les services Render.
- Dépôt : ATAYI-jo/AfriFlow-Feuille-de-Route ; branche de production : main.
- Site HTML/CSS/JS servi depuis la racine du dépôt, sans package.json.

## Configuration Cloudflare Pages, plan gratuit
1. Workers & Pages > Create > Pages > Connect to Git.
2. Autoriser le dépôt ATAYI-jo/AfriFlow-Feuille-de-Route.
3. Choisir la branche de production main.
4. Framework : None ; build command : vide ; output directory : . ; root : dépôt.
5. Publier et relever la vraie adresse *.pages.dev avant tout changement applicatif.

## Vérifications avant bascule
- Interface, Market, images et documents Dropbox.
- Supabase Auth : URLs de redirection, OAuth, récupération de mot de passe, Turnstile.
- Fonctions Supabase : les fichiers supabase/functions/afriflow-dropbox-admin/index.ts et supabase/functions/afriflow-push/index.ts comportent des origines CORS Render codées en dur. Ajouter la nouvelle origine après création du domaine et redéployer les fonctions.
- Les abonnements web push / notifications sont liés à l'origine et pourront nécessiter une réinscription.
- Android : android/app/src/main/java/africa/afriflow/app/MainActivity.java définit HOME sur Render ; une nouvelle compilation sera nécessaire.
- Windows : desktop/main.js définit HOME sur Render ; une nouvelle version sera nécessaire.
- index.html : modifier les balises og:url et og:image qui pointent sur Render après validation de la nouvelle adresse.
- Ne supprimer ni les anciennes origines CORS ni Render avant validation des applications installées.

## Sécurité et non-régression
- Ne pas publier de clés service-role, Dropbox ou Firebase dans les fichiers statiques.
- Supabase, Dropbox et les fonctions côté serveur restent des services indépendants de l'hébergement HTML.
- Ce document prépare la migration ; aucune mise en production Cloudflare n'a encore été effectuée.