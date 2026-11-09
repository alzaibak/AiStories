# MediTender

Plateforme B2B d’e-tendering pharmaceutique pour publier des appels d’offres, recevoir des offres de vendeurs vérifiés et formaliser les décisions d’achat.

## Architecture

- Interface : React, TypeScript, Vite, React Router et Tailwind CSS.
- API REST : Node.js, Express et Sequelize, sous `/api/v1`.
- Base de données : MySQL.
- Catalogue, appels d’offres, offres, documents, clarifications, messages et bons de commande : modèles Sequelize dans `backend/models/`.

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

Le seed crée un administrateur, deux acheteurs, quatre vendeurs, trois appels d’offres et douze offres. Définir des secrets dédiés à l’environnement avant d’exécuter :

```powershell
$env:SEED_ADMIN_EMAIL = "admin@exemple.test"
$env:SEED_ADMIN_PASSWORD = "<secret de 12 caractères minimum>"
$env:SEED_USER_PASSWORD = "<secret de 12 caractères minimum>"
npm run seed --prefix backend
```

## Migrations de base

Les migrations sont versionnées et exécutées par `npm run migrate --prefix backend`. La migration `003-remove-commerce-schema` est destructive et irréversible : conformément à la décision de suppression définitive, elle supprime les tables `carts`, `orders` et `order_items`, les produits sans organisation vendeuse, ainsi que les anciennes colonnes de vente et de stock du catalogue. Ne l’exécuter que sur la base visée par cette transformation.

La migration `004-remove-legacy-user-fields` convertit les anciens mots de passe chiffrés AES en hashes avant de supprimer les champs de compatibilité. Si la base contient d’anciens comptes sans `passwordHash`, renseigner `SECRET_PASSWORD` dans `backend/.env` avant la migration. La migration `005-private-document-storage` prépare les métadonnées du stockage privé S3/MinIO. Les migrations n’ont pas été exécutées sur une base de données dans cet environnement.

La migration `006-role-email-authentication` ajoute la vérification e-mail et les défis OTP des acheteurs, vendeurs et administrateurs. Les comptes administrateurs sont créés sur invitation et chaque connexion administrateur exige un code e-mail. Les nouvelles routes client sont `/api/v1/seller/auth/register` et `/api/v1/buyer/auth/register`; les acheteurs et vendeurs utilisent ensuite `/api/v1/auth/login`, tandis que l’administration se connecte via `/api/v1/admin/auth/login`.

## Vérification

```powershell
npm run build
npm run lint
npm test
npm test --prefix backend
npx tsc --noEmit -p tsconfig.app.json
```
