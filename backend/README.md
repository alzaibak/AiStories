# API MediTender

API REST Node.js / Express, Sequelize et MySQL. Les routes sont montées sous `/api/v1`.

## Configuration et commandes

Copier `.env.example` en `.env`, configurer la connexion MySQL et remplacer `JWT_SECRET_KEY` et `OTP_HASH_SECRET` par des secrets distincts d’au moins 32 caractères. Configurer le relais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) et `CLIENT_DOMAIN` avec l’URL HTTP(S) réellement accessible par les utilisateurs (par exemple `http://10.39.52.238:8080`) pour activer les codes e-mail et leurs liens de retour vers les formulaires de vérification ou de réinitialisation.

```powershell
npm ci
npm run migrate
npm run dev
npm test
```

Le serveur applique les migrations versionnées avant d’écouter. Pour initialiser une base vide, aucun `SEED_ADMIN_PREVIOUS_EMAIL` n’est requis : définir `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` et `SEED_USER_PASSWORD`, puis lancer `npm run seed` depuis `backend`. Le seed complet applique les migrations et crée les données de démonstration. Pour transférer un super-administrateur existant, définir temporairement `SEED_ADMIN_PREVIOUS_EMAIL` avec son ancienne adresse et lancer `npm run seed:admin`. Cette commande n’exécute ni migrations ni données de démonstration ; sur une base vide, exécuter d’abord `npm run migrate` ou utiliser le seed complet. Par défaut, une collision est refusée. La suppression définitive de l’ancien compte exige `SEED_ADMIN_DELETE_PREVIOUS=true` et peut échouer si des lignes de l’historique y font référence. Sauvegardez et vérifiez la base cible avant d’appliquer des migrations.

## Routes actives

- `/api/v1/seller/auth/register` et `/api/v1/buyer/auth/register` : demande et vérification du code e-mail, puis création du compte client.
- `/api/v1/auth/login`, `/api/v1/auth/me` et `/api/v1/auth/email/*` : connexion acheteur/vendeur, session et vérification d’adresse.
- `/api/v1/admin/auth/*` : connexion administrateur avec code e-mail, invitations réservées au `SUPER_ADMIN` et approbation des nouveaux administrateurs.
- `/api/v1/auth/organizations` : onboarding acheteur et vérification des organisations.
- `/api/v1/admin` : indicateurs, comptes et journal d’audit.
- `/api/v1/tenders` : appels d’offres, publication, invitations et lignes demandées.
- `/api/v1/offers` : brouillons, soumission, isolation des offres et attribution.
- `/api/v1/catalog` : catégories et catalogue pharmaceutique par organisation vendeuse.
- `/api/v1/documents` : dépôt de métadonnées et vérification.
- `/api/v1/collaboration` : questions publiques et messagerie privée.
- `/api/v1/purchase-orders` : bons de commande.
- `/api/v1/notifications` : notifications de compte.
- `/api/v1/health` : disponibilité de l’API.
- `/api/v1/docs` : documentation interactive Swagger UI ; le document OpenAPI est disponible sur `/api/v1/openapi.json`.

## Données et sécurité

Les offres sont par défaut scellées jusqu’à l’échéance. Les montants sont recalculés côté API, un vendeur ne lit que ses offres et la soumission exige une organisation vendeuse approuvée. Les certificats obligatoires sont vérifiés contre les documents approuvés associés à l’offre.

La migration `003-remove-commerce-schema` supprime définitivement les tables `carts`, `orders` et `order_items`, les produits non associés à un vendeur ainsi que les colonnes de vente au détail et de stock. Cette migration n’a pas de retour arrière : ses données ne sont pas archivées.

Les documents PDF et ZIP sont téléversés directement dans un bucket S3/MinIO privé via formulaire POST présigné, limité à 20 Mo. L’API vérifie la taille et le type MIME avec `HeadObject` avant de copier l’objet vers une clé privée définitive, puis émet des URL de téléchargement valables cinq minutes après contrôle d’accès. Configurez `S3_BUCKET`, `S3_REGION` et, pour MinIO, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` ainsi que les identifiants ou un rôle de service. Le bucket doit rester privé, autoriser les POST CORS depuis les origines `CLIENT_DOMAIN` et appliquer une règle de cycle de vie supprimant après 24 h les objets du préfixe `private-document-uploads/`. Les métadonnées et liens externes déjà enregistrés ne sont pas migrés dans le bucket : ces documents doivent être téléversés à nouveau.

Helmet protège les en-têtes HTTP, CORS n’autorise que les origines configurées dans `CLIENT_DOMAIN` (liste séparée par des virgules), et les requêtes API ainsi que les tentatives d’authentification sont limitées en débit. Les corps d’inscription, de connexion, d’onboarding et de vérification d’organisation sont validés avec Zod. La migration `004-remove-legacy-user-fields` convertit les anciens mots de passe AES en hash PBKDF2 avant de supprimer les colonnes historiques ; sur une base existante contenant de tels comptes, configurez `SECRET_PASSWORD` avant son exécution.

Les codes acheteur/vendeur sont à 6 chiffres (15 minutes, 5 tentatives) et ceux d’administration à 8 chiffres (10 minutes, 3 tentatives). Les codes sont stockés sous forme de HMAC, expirent et ne peuvent être réutilisés ; un renvoi est possible après 60 secondes. Les vendeurs ne peuvent soumettre d’offre avant l’approbation de leur organisation. La migration `006-role-email-authentication` ajoute les défis e-mail et les rôles d’administration : comme les migrations incluent aussi `003-remove-commerce-schema`, vérifiez soigneusement la base cible avant de les appliquer.
