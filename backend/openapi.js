const commonResponses = {
  200: { description: 'Requête traitée.' },
  201: { description: 'Ressource créée.' },
  400: { description: 'Données de requête invalides.' },
  401: { description: 'Authentification requise.' },
  403: { description: 'Action non autorisée.' },
  404: { description: 'Ressource introuvable.' },
  409: { description: 'Conflit avec l’état actuel de la ressource.' },
  500: { description: 'Erreur interne du serveur.' }
};

function operation(summary, { publicAccess = false, body = false, ids = [], params = [] } = {}) {
  return {
    summary,
    security: publicAccess ? [] : [{ bearerAuth: [] }],
    ...(ids.length || params.length ? {
      parameters: [
        ...ids.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'integer' }
        })),
        ...params.map(({ name, type = 'string' }) => ({
          name,
          in: 'path',
          required: true,
          schema: { type }
        }))
      ]
    } : {}),
    ...(body ? {
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true }
          }
        }
      }
    } : {}),
    responses: commonResponses
  };
}

const paths = {
  '/health': { get: operation('Vérifier la disponibilité de l’API', { publicAccess: true }) },
  '/plans': { get: operation('Lister les formules actives traduites dans la langue demandée', { publicAccess: true }) },
  '/payments/webhook': {
    post: operation('Traiter un webhook Stripe signé', { publicAccess: true })
  },
  '/payments/books/checkout': {
    post: operation('Créer une session de paiement pour les livres', { body: true })
  },
  '/payments/subscriptions/checkout': {
    post: operation('Créer une session de paiement pour un abonnement', { body: true })
  },
  '/payments/session/{sessionId}': {
    get: operation('Consulter l’état d’un paiement du compte connecté', { params: [{ name: 'sessionId' }] })
  },
  '/subscriptions/{id}/cancel': {
    post: operation('Annuler le renouvellement d’un abonnement', { ids: ['id'] })
  },
  '/subscriptions/{id}/resume': {
    post: operation('Reprendre le renouvellement d’un abonnement', { ids: ['id'] })
  },
  '/admin/plans': {
    get: operation('Lister les formules pour l’administration'),
    post: operation('Créer une formule d’abonnement', { body: true })
  },
  '/admin/plans/{id}': {
    patch: operation('Modifier une formule d’abonnement', { body: true, ids: ['id'] })
  },
  '/admin/store-orders': {
    get: operation('Lister les commandes payées à traiter')
  },
  '/admin/store-orders/{id}/fulfillment': {
    patch: operation('Mettre à jour la préparation et l’expédition d’une commande', { body: true, ids: ['id'] })
  },
  '/admin/subscriptions/{id}': {
    patch: operation('Modifier un abonnement géré manuellement', { body: true, ids: ['id'] })
  },
  '/admin/subscriptions/{id}/cancel': {
    post: operation('Arrêter le renouvellement Stripe d’un abonnement', { ids: ['id'] })
  },
  '/admin/subscriptions/{id}/resume': {
    post: operation('Reprendre le renouvellement Stripe d’un abonnement', { ids: ['id'] })
  },
  '/reader/auth/register/request-code': {
    post: operation('Envoyer un code de vérification à un lecteur', { publicAccess: true, body: true })
  },
  '/reader/auth/register/verify-code': {
    post: operation('Vérifier le code e-mail d’un lecteur', { publicAccess: true, body: true })
  },
  '/reader/auth/register': {
    post: operation('Créer un compte lecteur après vérification e-mail', { publicAccess: true, body: true })
  },
  '/auth/login': { post: operation('Ouvrir une session', { publicAccess: true, body: true }) },
  '/auth/password/request-code': {
    post: operation('Envoyer un code de réinitialisation du mot de passe', { publicAccess: true, body: true })
  },
  '/auth/password/verify-code': {
    post: operation('Vérifier le code de réinitialisation', { publicAccess: true, body: true })
  },
  '/auth/password/reset': {
    post: operation('Définir un nouveau mot de passe après vérification du code', { publicAccess: true, body: true })
  },
  '/auth/email/request-code': {
    post: operation('Renvoyer un code pour vérifier un compte client', { publicAccess: true, body: true })
  },
  '/auth/email/verify-code': {
    post: operation('Vérifier l’adresse e-mail d’un compte client', { publicAccess: true, body: true })
  },
  '/auth/me': { get: operation('Lire le compte connecté') },
  '/collections': { get: operation('Lister les collections publiées', { publicAccess: true }) },
  '/collections/{slug}': {
    get: operation('Lire une collection et ses histoires publiées', { publicAccess: true, params: [{ name: 'slug' }] })
  },
  '/stories': { get: operation('Lister les histoires publiées', { publicAccess: true }) },
  '/stories/{slug}': {
    get: operation('Lire les métadonnées et les accès d’une histoire', { publicAccess: true, params: [{ name: 'slug' }] })
  },
  '/stories/{slug}/parts/{partNumber}': {
    get: operation('Lire une partie après contrôle d’accès', {
      publicAccess: true,
      params: [{ name: 'slug' }, { name: 'partNumber', type: 'integer' }]
    })
  },
  '/stories/{slug}/parts/{partNumber}/quiz': {
    get: operation('Lire un quiz validé sans exposer ses réponses', {
      publicAccess: true,
      params: [{ name: 'slug' }, { name: 'partNumber', type: 'integer' }]
    })
  },
  '/books': { get: operation('Lister les livres publiés', { publicAccess: true }) },
  '/books/{slug}': {
    get: operation('Lire les détails d’un livre', { publicAccess: true, params: [{ name: 'slug' }] })
  },
  '/books/{slug}/access': {
    get: operation('Vérifier le droit de téléchargement d’un ebook', { params: [{ name: 'slug' }] })
  },
  '/books/{slug}/download': {
    get: operation('Télécharger un livre numérique après contrôle d’accès', { params: [{ name: 'slug' }] })
  },
  '/books/{slug}/sample-download': {
    get: operation('Télécharger le PDF de démonstration après contrôle d’accès', { params: [{ name: 'slug' }] })
  },
  '/books/{slug}/local-download': {
    get: operation('Télécharger un ebook local après contrôle d’accès', { params: [{ name: 'slug' }] })
  },
  '/media-assets/{id}/url': {
    get: operation('Obtenir une URL média temporaire après contrôle d’accès', { publicAccess: true, ids: ['id'] })
  },
  '/media-assets/{id}/file': {
    get: operation('Lire un média local après contrôle d’accès', { publicAccess: true, ids: ['id'] })
  },
  '/quizzes/{id}/start': {
    post: operation('Démarrer un quiz minuté', { ids: ['id'] })
  },
  '/quizzes/{id}/attempts': {
    post: operation('Soumettre les réponses et obtenir le score et les sources', { body: true, ids: ['id'] })
  },
  '/reading-progress': { get: operation('Lire la progression du lecteur') },
  '/reading-progress/{storyId}': {
    put: operation('Enregistrer la progression de lecture', { body: true, ids: ['storyId'] })
  },
  '/admin/content/collections': {
    get: operation('Lister les collections dans l’administration'),
    post: operation('Créer une collection', { body: true })
  },
  '/admin/content/collections/{id}': {
    patch: operation('Modifier une collection', { body: true, ids: ['id'] })
  },
  '/admin/content/stories': {
    get: operation('Lister les histoires dans l’administration'),
    post: operation('Créer une histoire', { body: true })
  },
  '/admin/content/review-queue': { get: operation('Lister la file de revue assignée') },
  '/admin/content/stories/{id}': {
    patch: operation('Modifier une histoire', { body: true, ids: ['id'] })
  },
  '/admin/content/stories/{id}/reviewer': {
    put: operation('Assigner un réviseur', { body: true, ids: ['id'] })
  },
  '/admin/content/stories/{id}/submit-review': {
    post: operation('Soumettre une histoire à la revue', { ids: ['id'] })
  },
  '/admin/content/stories/{id}/review': {
    post: operation('Approuver une histoire ou demander des modifications', { body: true, ids: ['id'] })
  },
  '/admin/content/stories/{id}/publish': {
    post: operation('Publier une histoire approuvée', { ids: ['id'] })
  },
  '/admin/content/stories/{id}/parts': {
    post: operation('Créer une partie d’histoire', { body: true, ids: ['id'] })
  },
  '/admin/content/parts/{id}': {
    patch: operation('Modifier une partie', { body: true, ids: ['id'] }),
    delete: operation('Supprimer une partie et son quiz associé', { ids: ['id'] })
  },
  '/admin/content/parts/{id}/move': {
    post: operation('Réordonner une partie en renumérotant la liste dans une transaction', { body: true, ids: ['id'] })
  },
  '/admin/content/parts/{id}/duplicate': {
    post: operation('Dupliquer une partie à la fin de son histoire', { ids: ['id'] })
  },
  '/admin/content/stories/{id}/videos': {
    post: operation('Ajouter une vidéo après confirmation de la politique de représentation', { body: true, ids: ['id'] })
  },
  '/admin/content/videos/{id}': {
    patch: operation('Modifier les métadonnées d’une vidéo', { body: true, ids: ['id'] })
  },
  '/admin/content/stories/{id}/quizzes': {
    post: operation('Créer un quiz brouillon', { body: true, ids: ['id'] })
  },
  '/admin/content/quizzes/{id}/questions': {
    post: operation('Ajouter une question à un quiz', { body: true, ids: ['id'] })
  },
  '/admin/content/quizzes/{id}': {
    patch: operation('Modifier un quiz et retirer sa validation', { body: true, ids: ['id'] })
  },
  '/admin/content/questions/{id}': {
    patch: operation('Modifier une question et retirer la validation de son quiz', { body: true, ids: ['id'] })
  },
  '/admin/content/quizzes/{id}/validate': {
    post: operation('Valider un quiz pour publication', { body: true, ids: ['id'] })
  },
  '/admin/content/books': {
    get: operation('Lister et gérer les livres'),
    post: operation('Créer un livre papier ou numérique', { body: true })
  },
  '/admin/content/books/{id}': {
    patch: operation('Modifier un livre', { body: true, ids: ['id'] })
  },
  '/admin/content/media': {
    get: operation('Lister les médias'),
    post: operation('Enregistrer un média conforme à la politique de représentation', { body: true })
  },
  '/admin/content/media/upload-url': {
    post: operation('Créer un dépôt média privé temporaire', { body: true })
  },
  '/admin/content/media/{id}/upload': {
    post: operation('Téléverser un média vers le stockage local privé', { ids: ['id'] })
  },
  '/admin/content/media/{id}/complete': {
    post: operation('Vérifier et finaliser un dépôt média privé', { ids: ['id'] })
  },
  '/admin/content/style-guides': {
    get: operation('Lister les guides visuels'),
    post: operation('Créer un guide visuel', { body: true })
  },
  '/admin/content/style-guides/{id}': {
    patch: operation('Modifier un guide visuel', { body: true, ids: ['id'] })
  },
  '/admin/subscriptions': { get: operation('Consulter les abonnements et leurs états par lecteur') },
  '/admin/auth/invitations': {
    post: operation('Inviter un nouvel administrateur', { body: true })
  },
  '/admin/auth/register/request-code': {
    post: operation('Renvoyer un code d’invitation administrateur', { publicAccess: true, body: true })
  },
  '/admin/auth/register/verify-code': {
    post: operation('Vérifier le code d’invitation administrateur', { publicAccess: true, body: true })
  },
  '/admin/auth/register': {
    post: operation('Créer un compte administrateur invité', { publicAccess: true, body: true })
  },
  '/admin/auth/login': {
    post: operation('Demander un code de connexion administrateur', { publicAccess: true, body: true })
  },
  '/admin/auth/verify-code': {
    post: operation('Terminer une connexion administrateur avec le code e-mail', { publicAccess: true, body: true })
  },
  '/admin/auth/admins/pending': {
    get: operation('Lister les comptes administrateurs en attente')
  },
  '/admin/auth/admins/{id}/approval': {
    patch: operation('Approuver ou suspendre un administrateur', { body: true, ids: ['id'] })
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Islamic Stories API',
    version: '1.0.0',
    description: 'API arabe-first de publication, lecture et gestion de contenus éducatifs islamiques.'
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  security: [{ bearerAuth: [] }],
  paths
};
