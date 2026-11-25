# Recette QA — Histoires Islamiques (`AI stories`)

**Date** : 24 novembre 2026 · **Commit testé** : `d5d23a6` (`main`) · **Mode** : Phase 1 — constat seulement, **aucune correction de code applicatif**.

---

## 1. Résumé

| Indicateur | Valeur |
|---|---|
| Parcours couverts par rôle | 8 rôles / statuts, 25 routes publiques, 26 routes admin |
| Tests Playwright exécutés | 30 (dont 27 verts, 3 rouges liés au harnais ou à la limite de débit) |
| Bugs confirmés | **15** (1 bloquant, 4 majeurs, 10 mineurs) |
| Fonctionnalités mortes (route sans interface) | **5** |
| Bloquants pour une mise en production | **1** (Mystery Box : aucun écran acheteur, retour Stripe en 404) |

**Verdict Phase 1** : le socle public (lecture, compte, inscription par code email, dons, abonnements Stripe test) et le portail admin (balayage complet, publication d'un livre répercutée dans la boutique, export CSV) fonctionnent. En revanche, la fonctionnalité **Mystery Box est inutilisable par un acheteur** : le backend facture, mais il n'existe ni page produit, ni page de succès, ni écran « mes boîtes » — et l'e-mail de confirmation pointe vers une route inexistante. À corriger avant toute activation commerciale.

---

## 2. Environnement de recette

### 2.1 Contraintes rencontrées

- Les ports **5000 / 8080 / 8081** étaient déjà occupés par un **autre projet** (`e-tendering` / MediTender, PID 15520/5520/27664). Ils n'ont pas été touchés.
- L'application a donc été lancée sur des ports libres via deux configs Vite dédiées :
  - API : `127.0.0.1:5055` (`CLIENT_URL` et `ADMIN_URL` surchargés pour le CORS)
  - Site public : `127.0.0.1:5173` (`scripts/qa/vite.public.qa.config.ts`, proxy `/api` → 5055)
  - Portail admin : `127.0.0.1:5174` (`scripts/qa/vite.admin.qa.config.ts`, proxy `/api` → 5055)
- **Aucun e-mail réel n'a été envoyé** : `SMTP_HOST` est surchargé vers un **serveur SMTP de capture local** (`scripts/qa/smtp-sink.cjs`, port 2626) qui écrit les messages dans `scripts/qa/outbox/*.eml`. Les codes OTP d'admin et de vérification d'inscription en sont extraits automatiquement.
- **Aucun paiement réel** : `STRIPE_SECRET_KEY` est bien une clé **`sk_test_…`**. Les sessions Stripe ont été ouvertes (abonnement, don) mais **jamais payées**.
- Base de données réelle locale `aiStories` (MySQL 3306). Elle contenait **1 SUPER_ADMIN et 1 READER avec de vraies adresses Gmail** : ces comptes n'ont **pas** été utilisés, modifiés ni contactés.

### 2.2 Comptes de test créés (`scripts/qa/seed-qa.cjs`, idempotent)

| Clé | E-mail | Rôle | Statut | E-mail vérifié |
|---|---|---|---|---|
| reader | qa.reader@qa.test | READER | ACTIVE | oui |
| unverified | qa.unverified@qa.test | READER | ACTIVE | **non** |
| pending | qa.pending@qa.test | READER | PENDING | non |
| suspended | qa.suspended@qa.test | READER | SUSPENDED | oui |
| editor | qa.editor@qa.test | EDITOR | ACTIVE | oui |
| reviewer | qa.reviewer@qa.test | REVIEWER | ACTIVE | oui |
| admin | qa.admin@qa.test | ADMIN | ACTIVE | oui |
| superadmin | qa.superadmin@qa.test | SUPER_ADMIN | ACTIVE | oui |

Plus : 1 formule `qa-mensuel` (9,90 €/mois, translations ar/en/fr) et 1 campagne de dons `qa-campagne` (objectif 5 000 €, active), créées uniquement parce que la base n'en contenait aucune.

Mot de passe commun : `QaPass!2026x` (dans `scripts/qa/seed-qa.cjs`).

### 2.3 Harnais Playwright

```
scripts/qa/
  seed-qa.cjs                 comptes + fixtures
  smtp-sink.cjs               serveur SMTP de capture
  vite.public.qa.config.ts    site public 5173 → API 5055
  vite.admin.qa.config.ts     admin 5174 → API 5055
  playwright.config.ts        2 projets (public / admin), Chrome installé
  specs/00-setup.spec.ts      login réel par rôle + sauvegarde storageState
  specs/01-public.spec.ts     balayage visiteur + crawl des liens
  specs/01b-discovery.spec.ts cartographie des libellés réels
  specs/02-auth.spec.ts       statuts de compte + inscription
  specs/03-reader.spec.ts     parcours lecteur (lecture, abonnement, don, demande)
  specs/04-admin.spec.ts      balayage admin + livre + mystery box + rôles
  specs/05-mobile.spec.ts     390 px : débordement, cibles tactiles
  specs/06-crosscheck.spec.ts liens retour Stripe, déconnexion, cohérence
  artifacts/                  journaux, CSV exporté, rapport JSON/HTML
```

Relancer : `npx playwright test --config scripts/qa/playwright.config.ts` (l'API et les deux Vite doivent tourner ; voir §2.1).

**Note importante sur la limite de débit** : l'API applique `300 requêtes / 15 min / IP` **globalement** (`backend/index.js:50`). Deux passes de recette l'ont épuisée ; l'API a été redémarrée (compteur mémoire) pour terminer. Cet effet est en soi un défaut (voir bug **P2-5**).

---

## 3. Matrice flux / page × rôle × résultat

Légende : **OK** = conforme · **BUG** = défaut constaté · **MANQUANT** = fonctionnalité/route absente · **N/T** = non testé (voir §5).

| Flux / page | Visiteur | Lecteur vérifié | Non vérifié | Suspendu | Éditeur | Relecteur | Admin | Super-admin |
|---|---|---|---|---|---|---|---|---|
| Accueil `/ar` (3 langues) | OK ¹ | OK | OK | OK | — | — | — | — |
| Héros Mystery Box (accueil) | **BUG P1-1** | **BUG P1-1** | — | — | — | — | — | — |
| Liste des histoires + recherche | OK | OK | OK | OK | — | — | — | — |
| Détail histoire + barre de progression | OK | OK | OK | OK | — | — | — | — |
| Lecture d'un conte (`/read/1`) | OK ² | OK | OK | OK | — | — | — | — |
| Sauvegarde de progression (« حفظ تقدّمي ») | MANQUANT ³ | OK | OK | OK | — | — | — | — |
| Quiz de fin de partie | **MANQUANT** ⁴ | **MANQUANT** ⁴ | — | — | — | — | — | — |
| Boutique `/ar/books` | **BUG P2-1** (vide) | BUG P2-1 | — | — | — | — | OK (admin) | OK (admin) |
| Fiche livre non publié | **BUG P3-1** (message FR) | BUG P3-1 | — | — | — | — | — | — |
| Tarifs `/ar/pricing` | OK | OK (→ Stripe test) | OK | OK | — | — | — | — |
| Abonnement (CTA → Stripe) | — | OK | ⁵ | ⁵ | — | — | — | — |
| Don (montant → Stripe) | OK | OK | — | — | — | — | — | — |
| Demande de conte | OK (form) | OK (succès) | OK | OK | — | — | — | — |
| Événements `/ar/events` | OK (état vide) | OK | — | — | — | — | — | — |
| Connexion `/ar/login` | OK | OK | **BUG attendu** ⁶ | **OK** ⁷ | — | — | — | — |
| Inscription (code email) | OK | — | OK | — | — | — | — | — |
| Compte `/ar/account` (non connecté) | Redirige vers login | OK | N/T ⁸ | N/T ⁸ | — | — | — | — |
| Déconnexion | — | OK | — | — | — | — | — | — |
| Mot de passe oublié | N/T | N/T | — | — | — | — | — | — |
| « Mes Mystery Boxes » | MANQUANT | **MANQUANT P1-1** | — | — | — | — | — | — |
| Connexion admin (mot de passe + OTP) | — | — | — | — | OK ⁹ | OK ⁹ | OK | OK |
| Libellés écran de connexion admin | — | — | — | — | **BUG P2-6** | BUG P2-6 | BUG P2-6 | BUG P2-6 |
| Tableau de bord admin | — | — | — | — | OK ¹⁰ | OK ¹⁰ | OK ¹⁰ | OK |
| Contenu : histoires (liste, création, édition) | — | — | — | — | OK | Redirigé | OK | OK |
| Contenu : collections, quiz, vidéos, médias | — | — | — | — | OK | Non testé | OK | OK |
| File de relecture `/content/review-queue` | — | — | — | — | **BUG P3-3** (accès direct, 403) | OK | OK | Exclu volontairement ¹³ |
| Demandes de contes (admin) | — | — | — | — | OK | Non testé | OK | OK |
| Communauté (badges, avis, événements, équipes) | — | — | — | — | Non testé | Non testé | OK | OK |
| Livres (publier / archiver / supprimer) | — | — | — | — | Non testé | — | OK | OK |
| Livres → répercussion boutique publique | — | — | — | — | — | — | OK | OK |
| Mystery Box : liste, éditeur, enregistrement | — | — | — | — | Non testé | — | OK | OK |
| Mystery Box : achats + export CSV | — | — | — | — | — | — | OK | OK |
| Commandes papier `/admin/orders` | — | — | — | — | Redirigé | Redirigé | OK | OK |
| « Paiements Stripe » `/admin/money/payments` | — | — | — | — | — | — | **BUG P2-2** | **BUG P2-2** |
| Dons et campagnes (admin) | — | — | — | — | Redirigé | — | OK | OK |
| Codes promo (admin) | — | — | — | — | — | — | OK | OK |
| Abonnements / formules (admin) | — | — | — | — | — | — | OK | OK |
| Utilisateurs et rôles | — | — | — | — | Menu masqué / **BUG P3-3** (accès direct, 403) | Menu masqué / **BUG P3-3** | Menu masqué / **BUG P3-3** (accès direct) | OK ¹¹ |
| Modèles d'e-mails (admin) | — | — | — | — | — | — | Non testé | OK |
| Politique de représentation (admin) | — | — | — | — | — | — | OK | OK |
| Réglages système `/admin/system` | — | — | — | — | Redirigé | Redirigé | Stub P3-4 | Stub P3-4 |
| 404 publique / admin | OK | OK | OK | OK | OK | OK | OK | OK |
| Mobile 390 px (8 pages + admin) | OK ¹² | OK ¹² | — | — | — | — | — | — |

¹ Un `404` console apparaît au chargement de l'accueil (ressource non identifiée, aucune requête 404 dans les journaux réseau : probablement une icône/preload). À clarifier.
² Une `404` sur `…/parts/1/quiz` est déclenchée à chaque lecture (bug P3-2).
³ Le bloc « sauvegarder ma progression » n'apparaît que connecté : les invités voient le lien « سجّل الدخول للحفظ ».
⁴ Tous les quiz sont en brouillon : l'API renvoie 404, aucun quiz ne s'affiche côté public.
⁵ Compte non vérifié : l'API refuse la connexion (403 `EMAIL_NOT_VERIFIED`) — cohérent, mais aucun parcours de renvoi de code n'a été testé.
⁶ Message attendu et correct : « لم يتم التحقق من بريدك الإلكتروني… ».
⁷ Message générique : « البريد الإلكتروني أو كلمة المرور غير صحيحة… » (bonne pratique, pas d'énumération).
⁸ Non testé en état connecté pour ces statuts (connexion impossible par conception).
⁹ Connexion en deux étapes réellement testée (mot de passe puis code à 8 chiffres lu dans le SMTP de capture).
¹⁰ Voir bug P3-5 : les KPI « revenus / dons / concours » affichent « — » en dur.
¹¹ Statuts affichés en anglais brut (`ACTIVE`) — bug P3-6 ; bouton « تعليق الحساب » non localisé par le sélecteur de test.
¹² Aucun débordement horizontal à 390 px ; cibles tactiles de 20 px de haut — bug P3-7.
¹³ Le super-admin est explicitement redirigé hors de la file (`AdminLayout.tsx:176`) alors que l'API l'autorise (`allowRoles('ADMIN','REVIEWER')`) : garde volontaire, à confirmer côté produit.

---

## 4. Bugs détaillés

### P1-1 — Mystery Box : aucun écran acheteur, retours Stripe et e-mails en 404 (BLOQUANT)

- **Gravité** : bloquant (argent/fonctionnalité livrée inutilisable).
- **Écrans** : accueil, `/ar/mystery-box`, `/ar/mystery-box/success`, `/ar/profile?tab=mystery-boxes`, `/ar/account`.
- **Étapes** :
  1. Ouvrir `/ar` : le héros « 🎁 متاح الآن » s'affiche (titre de test `gckgvb`, prix 20,00 €, stock 20/20, compte à rebours).
  2. Chercher un lien vers la boîte : **aucun** (`a[href*="mystery-box"]` = `[]`), le bouton affiche « قريبًا » et n'est pas cliquable.
  3. Ouvrir `/ar/mystery-box` → page 404.
  4. Ouvrir `/ar/mystery-box/success?session_id=…` (URL `success_url` envoyée à Stripe par le backend) → page 404.
  5. Ouvrir `/ar/profile?tab=mystery-boxes` (URL `actionUrl` de l'e-mail de confirmation d'achat) → page 404.
  6. Ouvrir `/ar/account` : aucune section « mes boîtes » alors que l'API `GET /me/mystery-boxes` existe et renvoie des achats.
- **Obtenu** : le backend peut créer une session Stripe et encaisser ; l'acheteur n'a aucun parcours d'achat et, après paiement, atterrit sur une 404 sans voir son contenu.
- **Attendu** : page produit `/mystery-box/:slug`, page de succès, section « mes boîtes » dans le compte ; les URLs envoyées à Stripe et par e-mail doivent exister.
- **Fichiers** : `src/App.tsx` (aucune route `mystery-box/*` ni `profile`), `backend/routes/mysteryBox.js:370-371` (`success_url` / `cancel_url`), `backend/utils/mysteryBoxService.js` (`actionUrl` `${…}/profile?tab=mystery-boxes`), `src/pages/stories/StoryPlatform.tsx` (compte sans section boîte).
- **Correction proposée** : ajouter les routes (ou pointer `success_url` vers `/checkout/result` existant), remplacer `/profile` par `/account`, et brancher `GET /me/mystery-boxes` dans la page compte. Ne pas activer de boîte tant que ces écrans manquent.

### P2-1 — Boutique vide alors que la documentation annonce un ebook publié

- **Gravité** : majeur (parcours d'achat livre inaccessible, documentation fausse).
- **Étapes** : ouvrir `/ar/books` → « لا توجد كتب منشورة حاليًا » ; requête `GET /api/v1/books` → `count=0`.
- **Obtenu** : les 3 livres en base sont `status='draft'` (`yunus-ebook`, `kindness-lantern-demo`, `prophets-stories-print`).
- **Attendu** : le `README.md` (racine et `backend/README.md`) décrit `kindness-lantern-demo` comme **publié à 4,90 €** ; la boutique devrait l'afficher.
- **Fichier** : `backend/scripts/seed*.js` (les livres sont créés en brouillon) et/ou les deux README.
- **Correction** : publier l'ebook de démonstration dans le seed, ou corriger la documentation. Vérifié au passage : le bouton « نشر » de l'admin **fonctionne** (publication → `GET /books` renvoie 1 livre et `/ar/books` l'affiche).

### P2-2 — Deux entrées de menu admin mènent à la même page, libellé trompeur

- **Gravité** : majeur (incohérence de navigation, « même action, libellés différents »).
- **Étapes** : se connecter en admin, ouvrir « الطلبات » (`/ar/admin/orders`) puis « مدفوعات Stripe » (`/ar/admin/money/payments`).
- **Obtenu** : les deux écrans ont exactement le même titre `h1` « طلبات الكتب الورقية » et le même contenu (`AdminStoreOrdersPage`).
- **Attendu** : une seule entrée, ou une page « paiements Stripe » distincte avec son propre titre.
- **Fichier** : `src/AdminApp.tsx:82` (`money/payments` → `AdminStoreOrdersPage`, alors que `admin/orders` utilise le même composant).
- **Correction** : supprimer l'entrée en double ou implémenter la vue paiements.

### P2-5 — Limite de débit globale : 429 en cascade, session « perdue », message brut

- **Gravité** : majeur (robustesse ; un utilisateur ou un réseau partagé peut bloquer toute l'application).
- **Étapes** : enchaîner ~300 requêtes API en 15 min (une passe de recette suffit) puis recharger `/ar/pricing` et `/ar/story-request`.
- **Obtenu** : toutes les requêtes renvoient `429` ; l'interface affiche **« Erreur API (429). »** ; `/api/v1/auth/me` en 429 fait disparaître l'utilisateur de l'en-tête (l'application semble déconnectée) ; les pages admin affichent l'écran de connexion.
- **Attendu** : limite dédiée aux routes sensibles (auth, écritures), message explicite du type « trop de requêtes, réessayez dans X minutes », et surtout ne pas traiter un 429 sur `/auth/me` comme une perte de session.
- **Fichier** : `backend/index.js:50` ; gestion d'erreur dans `src/lib/api.ts` et `src/contexts/StoryAuthContext.tsx`.
- **Correction** : restreindre le limiteur global aux mutations et à l'authentification, ou augmenter la fenêtre ; ajouter un message localisé et conserver la session sur 429.

### P2-6 — Écran de connexion admin non traduit (français + arabe mélangés)

- **Gravité** : majeur (incohérence de langue visible sur l'écran d'entrée du portail).
- **Reproduction** : `/ar/admin/login`.
- **Obtenu** (capture `test-results/…/test-failed-1.png`) : « Connexion administrateur », « La connexion nécessite votre mot de passe… », « Mot de passe », « Envoyer le code de connexion », « Voir le site public » en **français**, alors que le libellé e-mail est en arabe (« البريد الإلكتروني ») et que tout le reste du portail est en arabe.
- **Fichier** : `src/pages/stories/StoryPlatform.tsx:2350-2365` (clés de traduction absentes des dictionnaires ar/en).
- **Correction** : compléter les entrées de la table de libellés pour cet écran.

### P3-1 — Messages d'erreur en français sur le site arabe

- `/ar/books/yunus-ebook` → « **Livre introuvable.** » sur une page entièrement arabe (idem avec un slug inexistant). Fichier : route `GET /books/:slug` (`backend/routes/storyPlatform.js`) + affichage direct de `error.message` (`src/pages/stories/StoryPlatform.tsx`).

### P3-2 — 404 de quiz à chaque lecture de partie

- À chaque ouverture d'un conte : `GET /api/v1/stories/companionship-in-the-cave/parts/1/quiz` → **404** + erreur console « Failed to load resource ». Le quiz existe en base mais en brouillon. Fichier : `src/pages/stories/StoryPlatform.tsx:1320` (appel systématique) et route quiz (404 au lieu de `{quiz:null}`).

### P3-3 — Accès direct par URL à une page interdite : écran rendu, API 403

- **Gravité** : mineur (aucune fuite de données ; le menu est correctement masqué, mais l'URL est ouverte et l'écran se charge à moitié).
- **Reproduction** (les entrées de menu sont bien masquées pour ces rôles) :
  - Rôle **ADMIN** → coller `/ar/admin/system/users` : la page s'ouvre, `GET /api/v1/admin/users` → **403** (réservé SUPER_ADMIN), tableau vide sans message.
  - Rôle **ÉDITEUR** → coller `/ar/admin/content/review-queue` : la page s'ouvre, `GET /api/v1/admin/content/review-queue` → **403**.
- **Attendu** : redirection avec message (comme pour `/admin/orders` côté éditeur) au lieu d'un écran vide.
- **Fichiers** : `src/pages/stories/AdminLayout.tsx:171-180` (gardes de route : seul l'éditeur a une liste de chemins interdits, pas de règle pour `system/users` ni pour la file côté éditeur), `backend/routes/roleAuthentication.js:765` (`allowRoles('SUPER_ADMIN')`), `backend/routes/storyPlatform.js:2205` (`allowRoles('ADMIN','REVIEWER')`).
- **Correction** : ajouter une table `chemin → rôles autorisés` unique, utilisée à la fois par le menu et par le garde de route.
- **Note (comportement volontaire à confirmer)** : le **SUPER_ADMIN** est redirigé hors de `/admin/content/review-queue` (`AdminLayout.tsx:176`) alors que l'API l'autorise ; l'entrée de menu lui est également retirée. Cohérent en façade, mais à valider côté produit.

### P3-4 — Entrée de menu « إعدادات النظام » = page stub

- `/ar/admin/system` affiche « هذه الصفحة غير مفعلة بعد. ستُضاف عند تنفيذ المرحلة الخاصة بها. » alors que l'entrée figure dans la navigation du super-admin. Fichier : `src/AdminApp.tsx:90` (`AdminModulePage`).

### P3-5 — Tableau de bord : KPI en dur (« — ») malgré des données existantes

- Les cartes « الإيرادات هذا الشهر », « التبرعات », « المسابقة النشطة » affichent « — » et « لا تتوفر بيانات … بعد », alors que la page Dons liste bien la campagne active et que les abonnements/commandes ont des écrans dédiés. Fichier : `src/pages/stories/AdminDashboardPages.tsx` (`AdminDashboardPage`).

### P3-6 — Statuts bruts et libellés non localisés dans l'admin

- Tableau utilisateurs : statut `ACTIVE` en anglais dans une interface arabe. Tableau livres : bouton « **Archiver** » en français entre « نشر » et « حذف ». Fichiers : `src/pages/stories/AdminAccountPages.tsx`, `src/pages/stories/AdminDashboardPages.tsx:540`.

### P3-7 — Cibles tactiles trop petites sur mobile

- À 390 px : **aucun débordement horizontal** (bon point), mais de nombreux liens font **20 px de haut** (footer : « القصص », « المتجر », « الفعاليات » … ; bouton « نسيت كلمة المرور ؟ » 292×20). Recommandation : ≥ 44 px de zone cliquable.

### P3-8 — Données de démonstration visibles par les visiteurs

- Le héros public affiche les boîtes de test `gckgvb` (titre affiché en `h1`) et `hvyvpiuuoz`, l'une active à 20,00 € avec stock 20/20. Ce sont des traces de tests manuels laissées en base. Correction : jeu de données de démo propre ou nettoyage avant mise en ligne.

### P3-9 — Personnalisation du produit Stripe non localisée

- Un lecteur en session `/ar` ouvre Stripe Checkout et voit « **Subscribe to Abonnement QA** / €9.90 per month » (nom de la formule en français) sur une page anglaise. Le nom envoyé au fournisseur devrait suivre la langue du lecteur. Fichier : création de session d'abonnement (`backend/routes/payments.js`).

### P3-10 (à confirmer) — Abonnement abandonné : le CTA ne relance pas Stripe

- Première passe : CTA « s'abonner » → redirection Stripe (OK). Après abandon, le compte affiche « اشتراك تجريبي · غير مكتمل » et, à la seconde tentative, le clic sur le CTA **ne déclenche plus de navigation** (reste sur `/ar/pricing`). Le message d'erreur n'a pas pu être capturé (limite de débit atteinte). À reproduire : soit un comportement voulu (une souscription `incomplete` bloque la suivante), soit une impasse.

---

## 5. Ce qui n'a pas pu être testé

| Élément | Raison |
|---|---|
| Paiement réel, webhooks Stripe (attribution des droits, libération de stock, remboursement) | Aucun paiement effectué : la recette s'arrête à la page Stripe de test. Les webhooks exigent un tunnel ou `stripe listen` (CLI non installé). |
| Achat Mystery Box de bout en bout | **Aucun écran acheteur n'existe** (bug P1-1). Les endpoints ont été vérifiés côté code uniquement. |
| Envoi réel d'e-mails | SMTP remplacé par un serveur de capture local. Les gabarits et l'extraction des codes ont été validés ; la délivrabilité réelle ne l'est pas. |
| Réinitialisation de mot de passe (lecteur et admin) | Non exécutée pour préserver le quota de 10 connexions/15 min (le parcours code + nouveau mot de passe reste à couvrir). |
| Quiz de fin de partie | Tous les quiz sont en brouillon (404 public). Le flux de tentative (timer, score, échec verrouillé) n'a pas été exercé. |
| Commandes papier / expédition / suivi | Aucune commande payée en base. |
| Suspension d'un compte, changement de rôle, invitation d'admin | Bouton « تعليق الحساب » non localisé par le sélecteur (lignes rendues en `div`, pas `tr`) ; action non exécutée pour ne pas casser les comptes de test. |
| Codes promo, modèles d'e-mails (envoi de test), médias/vidéos | Effleurés (pages chargées sans erreur) mais aucun scénario d'écriture. |
| Isolation multi-utilisateurs | Une seule lectrice de test ; pas de vérification croisée « données d'un autre utilisateur ». |
| Accessibilité approfondie | Pas d'audit axe/lecteur d'écran ; seuls débordement, taille des cibles et présence de `role`/`aria-*` ont été contrôlés. Contraste non mesuré. |
| Parcours en anglais/français complets | Vérifié ponctuellement (admin FR : 48 caractères arabes subsistent dans la page de connexion et quelques libellés). |

---

## 6. Artefacts

- Journaux détaillés : `scripts/qa/artifacts/{sweep-public,auth,reader,admin,mobile,crosscheck,discovery}.log`
- Rapport Playwright : `scripts/qa/artifacts/report.json` et `artifacts/html/index.html`
- Captures d'échec : `test-results/**/test-failed-1.png`
- Export CSV vérifié : `scripts/qa/artifacts/export-box.csv`
- Messages capturés : `scripts/qa/outbox/*.eml`

**Effets de bord assumés sur la base de test** : `kindness-lantern-demo` a été publié (test admin → boutique publique), un abonnement `incomplete` a été créé pour `qa.reader`, une progression de lecture y a été enregistrée, un compte `qa.<timestamp>@qa.test` a été inscrit, et une demande de conte a été soumise. `scripts/qa/seed-qa.cjs` peut être relancé pour réinitialiser les comptes QA.

---

## 7. Conclusion Phase 1

Le parcours « lecteur » et le socle admin sont globalement solides : connexion à deux facteurs réelle, publication d'un livre répercutée côté public, export CSV fonctionnel, états vides corrects, 404 propres, aucune erreur JavaScript non gérée dans le parcours public, pas de débordement mobile.

La fonctionnalité **Mystery Box** est en revanche incohérente de bout en bout (backend + admin livrés, acheteur absent) et doit être traitée avant toute commercialisation. Viennent ensuite les incohérences de rôles admin (pages visibles mais 403), la limite de débit qui déconnecte l'utilisateur, et la boutique vide malgré la documentation.

**Phase 2** (après ta relecture) : je corrigerai dans cet ordre — P1-1 (routes Mystery Box + liens de retour), P2-5 (limiteur de débit et session), P2-2 (navigation admin en double), P2-6 (langue de l'écran de connexion admin), P2-1 (boutique vide), puis P3 (`P3-3` gardes de route, messages localisés, KPI en dur, cibles tactiles, données de démo) — avec un test par bug et relance complète des suites à chaque lot.
