# AfriFloW — audit préliminaire juridique et accessibilité
Date : 10 novembre 2026. Périmètre : examen statique des fichiers `index.html` et `afriflow-first-use.js` de la branche principale. Droit : France/UE. **Ce document n'est ni un certificat de conformité, ni un avis juridique exhaustif.** Les statuts « manquant » signifient non trouvé dans les fichiers examinés, pas preuve d'absence dans tous les services connexes. La configuration effective Supabase, le réseau navigateur, les licences et la situation de l'éditeur restent à vérifier.

| # | Point | État | Où / constat | Action |
|---|---|---|---|---|
| 1 | Mentions légales | ❌ | Aucune mention repérée dans `index.html` ; pas de `mentions-legales.html` à la racine | Ajouter l'éditeur, adresse professionnelle adaptée au statut, contact, responsable de publication et hébergeur(s), **après confirmation des données exactes** |
| 2 | Confidentialité | ❌ | `afriflow-first-use.js` indique expressément que le résumé ne remplace pas une politique complète | Rédiger information RGPD par traitement : responsable, finalités, bases légales, destinataires, transferts, durées, droits et contact |
| 3 | CGU/CGV | ⚠️ | Conditions essentielles dans `afriflow-first-use.js`, pas de CGU détaillées trouvées | Distinguer CGU d'une plateforme privée et CGV si vente effective ; ne pas assimiler acceptation des CGU au consentement RGPD |
| 4 | Remboursement / rétractation | ⚠️ | Boutique en ligne mentionnée dans une étape future `index.html`, pas de parcours de vente confirmé | Avant toute vente B2C à distance, déterminer l'application du délai légal et exceptions puis publier informations adaptées |
| 5 | Informations cookies | ⚠️ | Stockage local vu dans `index.html` et `afriflow-first-use.js` ; inventaire des traceurs incomplet | Documenter technologies locales et tiers ; politique distincte facultative |
| 6 | Bandeau cookies | ⚠️ | Aucun bandeau trouvé dans les fichiers examinés ; cela ne suffit pas à conclure qu'il est requis | Mesurer dépôts/accès aux traceurs, puis bloquer les non essentiels avant consentement et proposer refus aussi simple qu'acceptation si applicable |
| 7 | Formulaires | ⚠️ | Champs d'inscription `index.html` ~423–428 ; case pour les conditions et option facultative de notifications dans `afriflow-first-use.js` | Ajouter information RGPD à l'inscription ; demander consentement uniquement là où c'est la base appropriée |
| 8 | Minimisation | ⚠️ | Email, nom, fichiers, journaux de connexion utilisés dans `index.html` ; stockage et logs à examiner | Inventaire par champ ; justifier et limiter la conservation ; éviter logs excessifs |
| 9 | Tiers | ⚠️ | Supabase CDN ~2248 ; Dropbox OAuth ~1819 ; Office viewer ~4958 ; CDN JS ~1789 ; services IA et push | Inventorier chaque appel réseau, ses données, ses déclencheurs ; vérifier les transferts et sous-traitants |
| 10 | Interfaces trompeuses | ⚠️ | Non démontrable par seule inspection ciblée | Parcours complet sur mobile et desktop ; tester refus/options de notification et désactivation |
| 11 | Prix/frais | ⚠️ | Aucun tunnel de vente confirmé | Si vente, afficher prix TTC, frais et éléments précontractuels avant commande |
| 12 | Avis | ⚠️ | Aucun module d'avis consommateurs vérifié | En cas d'avis publiés, afficher modalités de contrôle et éviter les faux avis |
| 13 | Allégations | ⚠️ | Contenu marketing éditable par utilisateurs autorisés | Contrôle éditorial préalable des chiffres et promesses |
| 14 | Alternatives images | ✅/⚠️ | Images HTML de base dotées d'`alt`, notamment ~415, 447, 483 ; certaines `alt=""` décoratives | Vérifier images chargées dynamiquement, notamment celles porteuses de sens |
| 15 | Contraste | ⚠️ | Feuilles CSS et mode sombre `index.html` ~22–26 | Mesures WCAG dans les différents thèmes et modules, sur téléphone |
| 16 | Clavier | ⚠️ | `:focus-visible` ~54 ; plusieurs panneaux et éditeurs dynamiques | Tests de parcours réel, ordre de tabulation, modales et focus |
| 17 | Mineurs | ⚠️ | Aucune politique d'âge identifiée | Déterminer l'audience ; adapter règles et consentement lorsqu'applicables |
| 18 | Email marketing | ⚠️ | Aucun envoi marketing confirmé ; notifications push distinctes | Si prospection email, vérifier consentement/base et mécanisme de désabonnement |
| 19 | Licences | ⚠️ | Logo local, contenus utilisateurs, CDN JS, icônes, services externes | Garder inventaire licences et autorisations commerciales, attributions selon licence |
| 20 | Effacement | ⚠️ | `AFRI.deleteUser` ~2410, action administrateur ~2228 ; pas de voie claire pour l'utilisateur | Canal d'exercice des droits, vérification d'identité proportionnée, procédure de suppression Supabase/stockages selon obligations |

## Priorités (avant déploiement des pages juridiques)
1. **Contrôler les accès et les données** : politiques RLS Supabase, fichiers Dropbox, journaux, conservation, secrets et permissions.
2. **Compléter la transparence RGPD** : identité réelle du responsable, contact, traitements et durées.
3. **Publier des mentions légales exactes** : ne pas inventer identité, adresse ou statut juridique.
4. **Faire l'inventaire technique des traceurs / prestataires** : déterminer si un bandeau est réellement nécessaire.
5. **Permettre une demande d'accès/effacement** : canal clair, vérifiable et processus documenté.

## Contraintes de validation
- Ne jamais publier de fausses mentions légales ou un bandeau « accepter/refuser » si aucun cookie soumis au consentement n'est présent.
- Ne jamais bloquer la connexion, le stockage strictement nécessaire ou les notifications techniques uniquement sur la base d'un consentement marketing.
- Le code de la branche principale doit être préservé ; les modifications sont proposées via PR et sont réversibles.
- Compléter les informations d'éditeur et réaliser les tests réseau/navigateur avant de déclarer le site conforme.
