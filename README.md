# حكايات إسلامية

Plateforme de récits islamiques disponible en français, anglais et arabe. Elle propose des histoires sourcées, une lecture par épisodes, des quiz et une bibliothèque de livres pour toute la famille.

## Architecture

- Interface React, TypeScript, Vite, React Router et Tailwind CSS, avec les routes `/fr`, `/en` et `/ar` (RTL en arabe).
- API REST : Node.js, Express et Sequelize, sous `/api/v1` : inscription par e-mail, histoires, quiz, progression de lecture et livres.
- Base de données : MySQL.
- Histoires, révisions éditoriales, abonnements, droits d’accès et livres : modèles Sequelize dans `backend/models/`.

Chaque préfixe de langue expose les mêmes routes, par exemple `/fr/stories`, `/en/books` et `/ar/login`. Les formulaires d’inscription et de mot de passe oublié sont disponibles dans chaque langue. Le tableau d’administration (`/fr/admin`, `/en/admin` ou `/ar/admin`) réunit la navigation, la recherche et les pages séparées pour les collections, histoires, épisodes, livres, commandes et abonnements. Les textes de contenu se saisissent manuellement dans des onglets AR/EN/FR : l’arabe est requis, l’anglais et le français sont facultatifs et les champs vides s’affichent en arabe ; aucune traduction automatique n’est faite. Les modules sans routes ou opérations API sont indiqués comme bientôt disponibles. La page `/fr/pricing` (également disponible en anglais et en arabe) compare les prix et les avantages. Les ebooks peuvent être achetés séparément ; le téléchargement est réservé aux acheteurs autorisés. Le mode clair/sombre de lecture est mémorisé sur l’appareil. L’inscription lecteur vérifie l’adresse e-mail par OTP. Les états d’abonnement par utilisateur sont consultables dans son compte. Les paiements passent par Stripe Checkout; configurez les clés et le tarif d’expédition avant de les activer.

## Démarrage local

1. Installer les dépendances front et API :

   ```powershell
   npm ci
   npm ci --prefix backend
   ```

2. Copier `backend/.env.example` vers `backend/.env`, puis configurer MySQL, des secrets aléatoires distincts `JWT_SECRET_KEY`/`OTP_HASH_SECRET` (au moins 64 caractères chacun; ne jamais réutiliser une clé exposée) et le relais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).
3. Appliquer les migrations :

   ```powershell
   npm run migrate --prefix backend
   ```

4. Lancer l’API et l’interface dans deux terminaux :

   ```powershell
   npm run dev --prefix backend
   npm run dev
   ```

   L’API écoute sur `http://localhost:5000/api/v1`. Le front peut utiliser une autre adresse via `VITE_API_URL`.
   La documentation interactive de l’API est disponible sur `http://localhost:5000/api/v1/docs`.

## Données de démonstration

Le seed crée le compte administrateur, trois histoires brouillon, deux livres de préparation non publiés et un ebook de démonstration original publié (4,90 EUR). Ce dernier utilise un petit PDF local et son téléchargement reste protégé par un droit d’accès ; il ne nécessite pas de bucket S3. Les autres ebooks publiés utilisent le stockage S3/MinIO privé. Définissez un secret dédié à l’environnement avant d’exécuter le seed :

```powershell
$env:SEED_ADMIN_EMAIL = "admin@exemple.test"
$env:SEED_ADMIN_PASSWORD = "<secret de 12 caractères minimum>"
npm run seed --prefix backend
```

## Migrations de base

Les migrations sont versionnées et exécutées par `npm run migrate --prefix backend`. La migration `003-remove-commerce-schema` est destructive et irréversible : conformément à la décision de suppression définitive, elle supprime les tables `carts`, `orders` et `order_items`, les produits sans organisation vendeuse, ainsi que les anciennes colonnes de vente et de stock du catalogue. Ne l’exécuter que sur la base visée par cette transformation.

La migration `004-remove-legacy-user-fields` convertit les anciens mots de passe chiffrés AES en hashes avant de supprimer les champs de compatibilité. Si la base contient d’anciens comptes sans `passwordHash`, renseigner `SECRET_PASSWORD` dans `backend/.env` avant la migration. La migration `005-private-document-storage` prépare les métadonnées du stockage privé S3-compatible. Les migrations n’ont pas été exécutées sur une base de données dans cet environnement.

### Stockage privé des ebooks et médias

En développement, `STORAGE_DRIVER=local` conserve les fichiers dans `backend/private_uploads`, hors des dossiers statiques. Les téléchargements passent par l’API authentifiée et les contrôles d’accès; aucun lien public vers le fichier local n’est créé. `STORAGE_MAX_UPLOAD_BYTES` règle la taille maximale (20 MiB par défaut). Le nom de fichier est généré par le serveur, et le type réel est vérifié à partir de la signature du fichier.

En production, configurez `STORAGE_DRIVER=s3` et `S3_BUCKET`. `S3_REGION` est facultatif (par défaut `us-east-1`); `S3_ENDPOINT` est facultatif pour AWS et doit être renseigné pour Cloudflare R2 ou MinIO; `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` sont facultatives ensemble si un rôle de service est disponible; `S3_FORCE_PATH_STYLE` est facultatif et activé automatiquement avec un endpoint personnalisé. Gardez le bucket privé. Les formulaires présignés et liens de lecture expirent après cinq minutes. Consultez [backend/.env.example](./backend/.env.example) pour la configuration complète.

La migration `006-role-email-authentication` ajoute la vérification e-mail et les défis OTP. Les migrations `009-create-story-platform`, `010-add-quiz-attempt-timer`, `011-add-payment-workflow`, `012-add-book-translations`, `013-align-email-challenge-roles`, `014-convert-legacy-buyers-to-readers` et `015-add-plan-translations` créent le schéma éditorial, les quiz chronométrés, le flux Stripe, les traductions manuelles, l’alignement des rôles et les formules multilingues. Les routes lecteur sont `/api/v1/reader/auth/register/request-code`, `/api/v1/reader/auth/register/verify-code` et `/api/v1/reader/auth/register`; la connexion utilise `/api/v1/auth/login`. Le paiement exige une configuration Stripe, une formule créée dans les trois langues et un tarif d’expédition explicite pour les livres papier. Les commandes papier payées et leurs adresses de livraison sont accessibles dans `/admin/orders`.

## Vérification

```powershell
npm run build
npm run lint
npm test
npm test --prefix backend
npx tsc --noEmit -p tsconfig.app.json
```
