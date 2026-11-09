# حكايات إسلامية

Plateforme de récits islamiques disponible en français, anglais et arabe. Elle propose des histoires sourcées, une lecture par épisodes, des quiz et une bibliothèque de livres pour toute la famille.

## Architecture

- Interface React, TypeScript, Vite, React Router et Tailwind CSS, avec les routes `/fr`, `/en` et `/ar` (RTL en arabe).
- API REST : Node.js, Express et Sequelize, sous `/api/v1` : inscription par e-mail, histoires, quiz, progression de lecture et livres.
- Base de données : MySQL.
- Histoires, révisions éditoriales, abonnements, droits d’accès et livres : modèles Sequelize dans `backend/models/`.

Chaque préfixe de langue expose les mêmes routes, par exemple `/fr/stories`, `/en/books` et `/ar/login`. Les formulaires d’inscription et de mot de passe oublié sont disponibles dans chaque langue. L’administration (`/fr/admin/content`, `/en/admin/content` ou `/ar/admin/content`) permet de saisir séparément les textes des collections, histoires, épisodes et livres dans les trois langues. Aucune traduction automatique n’est faite ; une histoire ou un livre sans texte dans la langue choisie n’est pas affiché dans cette langue. L’inscription lecteur vérifie l’adresse e-mail par OTP. Les états d’abonnement par utilisateur sont consultables dans son compte. Le paiement des livres publiés et les abonnements passent par Stripe Checkout; configurez les clés et le tarif d’expédition avant de les activer.

## Démarrage local

1. Installer les dépendances front et API :

   ```powershell
   npm ci
   npm ci --prefix backend
   ```

2. Copier `backend/.env.example` vers `backend/.env`, puis configurer MySQL, des secrets distincts `JWT_SECRET_KEY`/`OTP_HASH_SECRET` et le relais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).
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

Le seed crée le compte administrateur et trois histoires brouillon avec deux livres non publiés. Définissez un secret dédié à l’environnement avant de l’exécuter :

```powershell
$env:SEED_ADMIN_EMAIL = "admin@exemple.test"
$env:SEED_ADMIN_PASSWORD = "<secret de 12 caractères minimum>"
npm run seed --prefix backend
```

## Migrations de base

Les migrations sont versionnées et exécutées par `npm run migrate --prefix backend`. La migration `003-remove-commerce-schema` est destructive et irréversible : conformément à la décision de suppression définitive, elle supprime les tables `carts`, `orders` et `order_items`, les produits sans organisation vendeuse, ainsi que les anciennes colonnes de vente et de stock du catalogue. Ne l’exécuter que sur la base visée par cette transformation.

La migration `004-remove-legacy-user-fields` convertit les anciens mots de passe chiffrés AES en hashes avant de supprimer les champs de compatibilité. Si la base contient d’anciens comptes sans `passwordHash`, renseigner `SECRET_PASSWORD` dans `backend/.env` avant la migration. La migration `005-private-document-storage` prépare les métadonnées du stockage privé S3/MinIO. Les migrations n’ont pas été exécutées sur une base de données dans cet environnement.

La migration `006-role-email-authentication` ajoute la vérification e-mail et les défis OTP. Les migrations `009-create-story-platform`, `010-add-quiz-attempt-timer`, `011-add-payment-workflow` et `012-add-book-translations` créent le schéma éditorial, les quiz chronométrés, le flux Stripe et les versions linguistiques des livres. Les routes lecteur sont `/api/v1/reader/auth/register/request-code`, `/api/v1/reader/auth/register/verify-code` et `/api/v1/reader/auth/register`; la connexion utilise `/api/v1/auth/login`. Le paiement exige une configuration Stripe, une formule créée par l’administration et un tarif d’expédition explicite pour les livres papier. Les commandes papier payées et leurs adresses de livraison sont accessibles dans `/admin/orders`.

## Vérification

```powershell
npm run build
npm run lint
npm test
npm test --prefix backend
npx tsc --noEmit -p tsconfig.app.json
```
