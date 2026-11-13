# حكايات إسلامية
admin dashborad (npm run dev:admin)
Plateforme de récits islamiques disponible en français, anglais et arabe. Elle propose des histoires sourcées, une lecture par épisodes, des quiz et une bibliothèque de livres pour toute la famille.

## Architecture

- Interface React, TypeScript, Vite, React Router et Tailwind CSS, avec les routes `/fr`, `/en` et `/ar` (RTL en arabe).
- API REST : Node.js, Express et Sequelize, sous `/api/v1` : inscription par e-mail, histoires, quiz, progression de lecture et livres.
- Base de données : MySQL.
- Histoires, révisions éditoriales, abonnements, droits d’accès et livres : modèles Sequelize dans `backend/models/`.

Chaque préfixe de langue expose les routes publiques, par exemple `/fr/stories`, `/en/books` et `/ar/login`. L’administration utilise un build séparé (`npm run dev:admin`, port 8081 en développement) et doit être hébergée sur `ADMIN_URL`; le site public reste sur `CLIENT_URL`. Les textes de contenu se saisissent manuellement dans des onglets AR/EN/FR : l’arabe est requis, l’anglais et le français sont facultatifs et aucune traduction automatique n’est faite. Les histoires suivent le flux brouillon → révision → publication, avec approbation/réjection réservée aux administrateurs et aux super-administrateurs. Les livres peuvent être publiés et les ebooks sont téléchargeables uniquement par les acheteurs autorisés. Les paiements passent par Stripe Checkout; configurez les clés et le tarif d’expédition avant de les activer.

## Démarrage local

1. Installer les dépendances front et API :

   ```powershell
   npm ci
   npm ci --prefix backend
   ```

2. Copier `backend/.env.example` vers `backend/.env`, puis configurer MySQL, des secrets aléatoires distincts `JWT_SECRET_KEY`/`OTP_HASH_SECRET` (au moins 64 caractères chacun; ne jamais réutiliser une clé exposée) et le relais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`). Définir les origines distinctes `CLIENT_URL` et `ADMIN_URL`.
3. Appliquer les migrations :

   ```powershell
   npm run migrate --prefix backend
   ```

4. Lancer l’API et l’interface dans deux terminaux :

   ```powershell
   npm run dev --prefix backend
   npm run dev
   ```

   L’API écoute sur `http://localhost:5000/api/v1`. Dans deux autres terminaux, lancer `npm run dev` (site public, port 8080) et `npm run dev:admin` (administration, port 8081).
   La documentation interactive de l’API est disponible sur `http://localhost:5000/api/v1/docs`.

### Déploiement de l’administration

Exemple complet pour le domaine `dipahnt.fr` : le site public, l’administration et l’API ont chacun leur adresse. Les noms DNS ci-dessous sont des exemples; remplacez les destinations par celles fournies par votre hébergeur.

| Service | Adresse publique | Destination à configurer |
|---|---|---|
| Site public | `https://www.dipahnt.fr` | Hébergement statique du dossier `dist/` |
| Administration | `https://admin.dipahnt.fr` | Hébergement statique du dossier `dist-admin/` |
| API | `https://api.dipahnt.fr` | Serveur backend; le reverse proxy HTTPS transmet les requêtes à Node.js sur le port `5000` |

1. **DNS et HTTPS :** chez le fournisseur DNS, créez un `CNAME` (ou l’enregistrement demandé par l’hébergeur) pour `www` vers l’hébergement public, un pour `admin` vers l’hébergement admin, et un `A`/`AAAA` ou `CNAME` pour `api` vers le serveur ou reverse proxy de l’API. Vous pouvez faire rediriger `dipahnt.fr` vers `www.dipahnt.fr`. Activez un certificat HTTPS pour les trois hôtes. Les valeurs de destination DNS dépendent de l’hébergeur : ne copiez pas une adresse IP d’exemple.
2. **Backend :** dans `backend/.env`, définissez les origines exactes, sans chemin ni barre oblique finale. L’API doit avoir la configuration MySQL, les secrets, SMTP et, pour les paiements, Stripe nécessaires :

   ```dotenv
   CLIENT_URL=https://www.dipahnt.fr
   ADMIN_URL=https://admin.dipahnt.fr
   CLIENT_APP_URL=https://www.dipahnt.fr
   PORT=5000
   ```

   Démarrez l’API derrière le reverse proxy HTTPS de `api.dipahnt.fr`; le port `5000` reste le port interne de Node.js. Appliquez d’abord les migrations sur la base de production après en avoir fait une sauvegarde : `npm run migrate --prefix backend`.
3. **Builds frontend :** définissez les variables dans l’environnement de build de l’hébergeur, puis déployez les deux dossiers générés. Les valeurs `VITE_*` sont intégrées au build : les changer exige de reconstruire le frontend.

   Build public :

   ```powershell
   $env:VITE_CLIENT_URL = "https://www.dipahnt.fr"
   $env:VITE_ADMIN_URL = "https://admin.dipahnt.fr"
   $env:VITE_API_URL = "https://api.dipahnt.fr/api/v1"
   npm run build
   ```

   Publiez le contenu de `dist/` sur l’hôte `www.dipahnt.fr`.

   Build admin :

   ```powershell
   $env:VITE_CLIENT_URL = "https://www.dipahnt.fr"
   $env:VITE_ADMIN_API_URL = "https://api.dipahnt.fr/api/admin"
   npm run build:admin
   ```

   Publiez le contenu de `dist-admin/` sur `admin.dipahnt.fr`. Configurez cet hébergement pour servir `index.admin.html` à la racine et le réutiliser comme fallback SPA pour les routes telles que `/ar/admin/login`. Pour le site public, configurez le fallback SPA vers `index.html`.

4. **Connexion admin :** ouvrez `https://admin.dipahnt.fr/ar/admin/login` (ou remplacez `ar` par `en` ou `fr`). Connectez-vous avec un compte administrateur actif et le code reçu par e-mail. `http://localhost:8081` est uniquement l’adresse de développement locale; il ne faut pas utiliser `:8081` en production.

Le backend CORS autorise `CLIENT_URL` pour le site public et `ADMIN_URL` pour l’administration. Si vous choisissez le domaine racine `https://dipahnt.fr` plutôt que `www`, utilisez exactement cette même origine dans `CLIENT_URL`, `CLIENT_APP_URL` et `VITE_CLIENT_URL`, et configurez le DNS et HTTPS pour ce nom. La configuration des domaines personnalisés et des fallbacks SPA varie selon l’hébergeur; ne rendez pas le serveur Vite de développement accessible publiquement.

Pour créer le super-administrateur initial, définir `SUPERADMIN_EMAIL` et un mot de passe initial robuste dans `backend/.env`, puis exécuter `npm run seed:superadmin --prefix backend`. Le script hache le mot de passe, impose son changement à la première connexion et retire la ligne `SUPERADMIN_INITIAL_PASSWORD` du fichier après création. La récupération doit être lancée dans une console du serveur de production :

```powershell
$env:SUPERADMIN_RECOVERY_PASSWORD = "<mot-de-passe-temporaire-robuste>"
npm run reset:superadmin --prefix backend
Remove-Item Env:\SUPERADMIN_RECOVERY_PASSWORD
```

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

Les migrations `019` à `021` ajoutent la modération communautaire, les vidéos avec sous-titres AR/EN/FR, la checklist de sources avant publication, les événements, équipes, campagnes de dons, modèles d’e-mail et pages de politique. Les migrations `022` et `023` ajoutent les codes promotionnels/cadeaux, les annonces des gagnants, les reçus de dons et les dons mensuels récurrents. Les lecteurs peuvent annuler leurs dons mensuels depuis leur compte; les codes promotionnels se gèrent dans l’administration. Les rappels dus sont traités automatiquement par le processus API (`REMINDER_POLL_INTERVAL_MS`) et peuvent aussi être lancés manuellement depuis l’administration. Configurez Stripe en mode test, les webhooks signés et SMTP avant les essais; les migrations n’ont pas été exécutées sur une base réelle dans cet environnement. Une sauvegarde de MySQL est recommandée avant de les appliquer.

### Stockage privé des ebooks et médias

En développement, `STORAGE_DRIVER=local` conserve les fichiers dans `backend/private_uploads`, hors des dossiers statiques. Les téléchargements passent par l’API authentifiée et les contrôles d’accès; aucun lien public vers le fichier local n’est créé. `STORAGE_MAX_UPLOAD_BYTES` règle la taille maximale (20 MiB par défaut). Le nom de fichier est généré par le serveur, et le type réel est vérifié à partir de la signature du fichier.

En production, configurez `STORAGE_DRIVER=s3` et `S3_BUCKET`. `S3_REGION` est facultatif (par défaut `us-east-1`); `S3_ENDPOINT` est facultatif pour AWS et doit être renseigné pour Cloudflare R2 ou MinIO; `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` sont facultatives ensemble si un rôle de service est disponible; `S3_FORCE_PATH_STYLE` est facultatif et activé automatiquement avec un endpoint personnalisé. Gardez le bucket privé. Les formulaires présignés et liens de lecture expirent après cinq minutes. Consultez [backend/.env.example](./backend/.env.example) pour la configuration complète.

La migration `006-role-email-authentication` ajoute la vérification e-mail et les défis OTP. Les migrations `009` à `015` créent le schéma éditorial, les quiz chronométrés, le flux Stripe, les traductions manuelles et les formules multilingues. La migration `016-publishing-auth-and-slugs` ajoute le workflow de publication, les métadonnées de revue, la version des sessions et les anciennes redirections de slug. La migration `017-repair-book-publication-date` répare de façon idempotente le champ `books.publishedAt` s’il manque dans une base existante. Les codes OTP lecteur expirent après 10 minutes, autorisent cinq tentatives et appliquent un délai de renvoi de 60 secondes. Les routes lecteur sont `/api/v1/reader/auth/register/request-code`, `/api/v1/reader/auth/register/verify-code` et `/api/v1/reader/auth/register`; la connexion utilise `/api/v1/auth/login`. Le paiement exige une configuration Stripe, une formule créée dans les trois langues et un tarif d’expédition explicite pour les livres papier.

## Vérification

```powershell
npm run build
npm run lint
npm test
npm test --prefix backend
npx tsc --noEmit -p tsconfig.app.json
```
