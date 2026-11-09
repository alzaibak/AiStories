# API Islamic Stories

API REST Node.js / Express, Sequelize et MySQL. Les routes sont montées sous `/api/v1`.

## Configuration et commandes

Copier `.env.example` en `.env`, configurer la connexion MySQL et remplacer `JWT_SECRET_KEY` et `OTP_HASH_SECRET` par des secrets distincts d’au moins 32 caractères. Configurer le relais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) et `CLIENT_DOMAIN` avec l’URL HTTP(S) réellement accessible par les utilisateurs (par exemple `http://10.39.52.238:8080`) pour activer les codes e-mail et leurs liens de retour vers les formulaires de vérification ou de réinitialisation.

```powershell
npm ci
npm run migrate
npm run dev
npm test
```

Le serveur applique les migrations versionnées avant d’écouter. Pour initialiser une base vide, définissez `SEED_ADMIN_EMAIL` et `SEED_ADMIN_PASSWORD` (12 caractères minimum), puis lancez `npm run seed` depuis `backend`. Le seed complet applique les migrations et crée les exemples d’histoires. Pour transférer un super-administrateur existant, définissez temporairement `SEED_ADMIN_PREVIOUS_EMAIL` avec son ancienne adresse et lancez `npm run seed:admin`. Cette commande n’exécute ni migrations ni données de démonstration ; sur une base vide, exécutez d’abord `npm run migrate`. Par défaut, une collision est refusée. La suppression définitive de l’ancien compte exige `SEED_ADMIN_DELETE_PREVIOUS=true` et peut échouer si des lignes de l’historique y font référence. Sauvegardez et vérifiez la base cible avant d’appliquer des migrations.

## Routes actives

- `/api/v1/reader/auth/register/*` : inscription lecteur avec vérification par code e-mail.
- `/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/auth/email/*` : connexion lecteur, session et vérification d’adresse.
- `/api/v1/admin/auth/*` : connexion administrateur avec code e-mail, invitations réservées au `SUPER_ADMIN` et approbation des nouveaux administrateurs.
- `/api/v1/plans` : formules actives pour les lecteurs.
- `/api/v1/payments/books/checkout` et `/payments/subscriptions/checkout` : sessions Stripe Checkout réservées aux lecteurs.
- `/api/v1/payments/webhook` : événements Stripe vérifiés par signature et traités de façon idempotente.
- `/api/v1/subscriptions/:id/cancel` et `/resume` : gestion du renouvellement par son propriétaire.
- `/api/v1/admin/plans` et `/api/v1/admin/subscriptions` : gestion des formules et des états manuels; les états Stripe sont synchronisés par webhook.
- `/api/v1/admin/store-orders` : consultation des commandes papier payées et mise à jour de la préparation, de l’expédition et du suivi.
- `/api/v1/health` : disponibilité de l’API.
- `/api/v1/docs` : documentation interactive Swagger UI ; le document OpenAPI est disponible sur `/api/v1/openapi.json`.

## Données et sécurité

La migration `009-create-story-platform` ajoute le socle Sequelize du projet d’histoires : collections, histoires et parties, validation des quiz, médias et conformité de représentation, livres papier/numériques, panier et commandes, plans, abonnements, droits d’accès et idempotence des événements Stripe. Les migrations `010-add-quiz-attempt-timer` et `011-add-payment-workflow` ajoutent respectivement les tentatives minutées et les champs de paiement, d’adresse de livraison et d’identifiants Stripe. Le seed complet ajoute trois histoires arabes de démonstration et deux livres non publiés. Les histoires et quiz sont initialisés en brouillon.

Les livres publiés et les formules actives passent par Stripe Checkout; une commande papier réserve le stock jusqu’au paiement ou à l’expiration de la session, puis le webhook attribue les droits numériques ou libère le stock. Les remboursements complets signalés par Stripe révoquent les droits numériques de la ligne concernée. Les états d’abonnement Stripe sont mis à jour depuis les événements signés du fournisseur. Configurez `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_APP_URL`, `BOOK_SHIPPING_FEE` et `SUBSCRIPTION_GRACE_PERIOD_DAYS` avant d’activer les paiements. Le tarif d’expédition doit être explicitement défini, même s’il est égal à zéro. Créez d’abord les formules dans l’administration; aucune tarification commerciale n’est présélectionnée. L’application ne calcule pas les taxes; configurez vos prix et obligations fiscales avant d’accepter les paiements.

Les routes `/api/v1/reader/auth/*` fournissent l’inscription lecteur vérifiée par e-mail. `/api/v1/auth/password/request-code`, `/verify-code` et `/reset` permettent la réinitialisation du mot de passe après vérification OTP. `/api/v1/collections`, `/stories`, `/books`, les routes `/quizzes` et `/reading-progress` exposent la lecture et les quiz; le paramètre `lang=ar|en|fr` sélectionne le contenu manuel de la langue demandée. Pour l’anglais et le français, une histoire/partie/livre sans traduction saisie n’est pas renvoyé ; aucun texte de remplacement ni traduction automatique n’est utilisé. `/api/v1/admin/content/*` gère les collections, histoires, revue, parties, vidéos, quiz, livres, médias et guides visuels. Les réponses `/auth/me` et `/admin/subscriptions` incluent l’état d’accès effectif, tenant compte de l’expiration et de la période de grâce. Une même vérification d’accès contrôle les parties, quiz, fichiers de livres et médias privés.

La migration `012-add-book-translations` ajoute les champs de textes manuels des livres et peut être relancée si cette colonne existe déjà. Les migrations initiales `001` à `008` sont conservées pour assurer la compatibilité des bases déjà créées et permettre aux migrations suivantes de s’exécuter dans le bon ordre. Les routes et l’interface de l’ancien système de tendering ont été retirées. Ne supprimez pas les migrations historiques d’une base déjà déployée.

Les images de contenu et les livres numériques sont téléversés dans un bucket S3/MinIO privé via formulaire POST présigné. Configurez `S3_BUCKET`, `S3_REGION` et, pour MinIO, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` ainsi que les identifiants ou un rôle de service. Le bucket doit rester privé et autoriser les POST CORS depuis les origines configurées dans `CLIENT_DOMAIN`.

Helmet protège les en-têtes HTTP, CORS n’autorise que les origines configurées dans `CLIENT_DOMAIN` (liste séparée par des virgules), et les requêtes API ainsi que les tentatives d’authentification sont limitées en débit. Les corps d’inscription lecteur, de connexion, de réinitialisation et de gestion de contenu sont validés avec Zod. La migration historique `004-remove-legacy-user-fields` convertit les anciens mots de passe AES en hash PBKDF2 avant de supprimer les colonnes historiques ; sur une base existante contenant de tels comptes, configurez `SECRET_PASSWORD` avant son exécution.

Les codes lecteur sont à 6 chiffres (15 minutes, 5 tentatives) et ceux d’administration à 8 chiffres (10 minutes, 3 tentatives). Les codes sont stockés sous forme de HMAC, expirent et ne peuvent être réutilisés ; un renvoi est possible après 60 secondes. La migration `006-role-email-authentication` ajoute les défis e-mail et les rôles d’administration; `003-remove-commerce-schema` fait partie de l’historique de migration et peut supprimer des données commerciales obsolètes, vérifiez soigneusement la base cible avant de l’appliquer.
