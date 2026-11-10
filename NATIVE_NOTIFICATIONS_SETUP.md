# AfriFloW — notifications des applications natives

## Windows (Electron)
- La fermeture de la fenêtre conserve le processus AfriFloW dans la zone de notification (tray).
- L'application continue à interroger Supabase avec la session connectée, et peut afficher des notifications Windows.
- Une notification de réunion offre une ouverture de Teams au clic. Elle ne simule pas un appel VoIP ni un appel téléphonique natif.
- Au démarrage de Windows, AfriFloW est lancé en arrière-plan depuis son installateur (l'utilisateur peut désactiver ce démarrage dans Windows).
- Si l'utilisateur sélectionne **Quitter complètement** dans le tray, le processus s'arrête et ne pourra plus alerter avant le redémarrage d'AfriFloW.
- Les notifications système Windows et les paramètres de concentration peuvent les masquer.

## Android (Firebase Cloud Messaging)
L'APK actuel doit être recompilé avec la configuration Firebase réelle avant que les alertes fonctionnent quand l'application est fermée.

1. Créer un projet Firebase : https://console.firebase.google.com/
2. Ajouter une application Android portant exactement l'identifiant `africa.afriflow.app`.
3. Télécharger le fichier **google-services.json** pour cette application.
4. Sur GitHub → Settings → Secrets and variables → Actions, créer le secret `AFRIFLOW_FIREBASE_GOOGLE_SERVICES_JSON_B64`, avec la valeur Base64 du fichier google-services.json. **Ne pas committer ce fichier dans le dépôt public.** Le secret est injecté uniquement pendant la compilation.
5. Dans la console Firebase → Paramètres du projet → Comptes de service, générer une **nouvelle clé privée de compte de service** uniquement pour le serveur.
6. Dans Supabase → Edge Functions → Secrets, créer `AFRIFLOW_FIREBASE_SERVICE_ACCOUNT_JSON` avec le JSON intégral du compte de service (jamais dans le site, GitHub, ni l'APK).
7. Relancer le workflow `Build AfriFloW Android and Windows` depuis GitHub Actions et installer l'APK obtenu.
8. Dans l'application, accepter les notifications lors de la première utilisation et autoriser les notifications Android. Le jeton FCM est associé à l'utilisateur Supabase confirmé.
9. Planifier une réunion de test et vérifier les notifications sur écran verrouillé.

La fonction serveur `afriflow-fcm` et la tâche de contrôle chaque minute sont déjà présentes. Sans la configuration Firebase, la fonction ne peut pas envoyer de messages FCM.

**Attention :** les APK de test générés par GitHub utilisent une signature debug. Pour une distribution stable et les mises à jour sans désinstallation, prévoir une signature de publication permanente et privée.

## Restrictions et comportement attendu
- Android 13+ demande la permission POST_NOTIFICATIONS.
- Android peut empêcher certains sons ou affichages par les réglages système, économie d'énergie, mode silencieux ou arrêt forcé.
- Les réunions Teams peuvent afficher une notification prioritaire avec un bouton « Rejoindre Teams »; l'application n'est pas un véritable client VoIP et n'utilise pas un écran d'appel plein écran réservé aux applications d'appel/alarme.
- Le rendu iOS nécessite une implémentation distincte (Web Push pour les PWA installées ou APNs pour les apps natives).
