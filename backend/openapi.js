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

function operation(summary, { publicAccess = false, body = false, ids = [] } = {}) {
  return {
    summary,
    security: publicAccess ? [] : [{ bearerAuth: [] }],
    ...(ids.length ? {
      parameters: ids.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'integer' }
      }))
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
  '/seller/tenders': {
    get: operation('Lister les appels d’offres accessibles aux vendeurs')
  },
  '/seller/auth/register/request-code': {
    post: operation('Envoyer un code de vérification à un vendeur', { publicAccess: true, body: true })
  },
  '/seller/auth/register/verify-code': {
    post: operation('Vérifier le code e-mail d’un vendeur', { publicAccess: true, body: true })
  },
  '/seller/auth/register': {
    post: operation('Créer un compte vendeur après vérification e-mail', { publicAccess: true, body: true })
  },
  '/buyer/auth/register/request-code': {
    post: operation('Envoyer un code de vérification à un acheteur', { publicAccess: true, body: true })
  },
  '/buyer/auth/register/verify-code': {
    post: operation('Vérifier le code e-mail d’un acheteur', { publicAccess: true, body: true })
  },
  '/buyer/auth/register': {
    post: operation('Créer un compte acheteur après vérification e-mail', { publicAccess: true, body: true })
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
  '/auth/onboarding': { patch: operation('Compléter l’organisation d’un acheteur', { body: true }) },
  '/auth/organizations': { get: operation('Lister les organisations pour vérification') },
  '/auth/organizations/{id}/verification': {
    patch: operation('Valider ou rejeter une organisation', { body: true, ids: ['id'] })
  },
  '/admin/overview': { get: operation('Lire les indicateurs d’administration') },
  '/admin/users': { get: operation('Lister les comptes') },
  '/admin/users/{id}/status': { patch: operation('Modifier le statut d’un compte', { body: true, ids: ['id'] }) },
  '/admin/audit-logs': { get: operation('Consulter le journal d’audit') },
  '/tenders': {
    get: operation('Rechercher les appels d’offres accessibles'),
    post: operation('Créer un appel d’offres', { body: true })
  },
  '/tenders/{id}': {
    get: operation('Lire un appel d’offres', { ids: ['id'] }),
    patch: operation('Modifier un appel d’offres brouillon', { body: true, ids: ['id'] })
  },
  '/tenders/{id}/invitation-candidates': {
    get: operation('Lister les vendeurs pouvant être invités', { ids: ['id'] })
  },
  '/tenders/{id}/items': { post: operation('Ajouter une ligne demandée', { body: true, ids: ['id'] }) },
  '/tenders/{id}/publish': { post: operation('Publier un appel d’offres', { ids: ['id'] }) },
  '/tenders/{id}/invitations': { post: operation('Inviter des vendeurs', { body: true, ids: ['id'] }) },
  '/tenders/{id}/close': { post: operation('Clore un appel d’offres', { ids: ['id'] }) },
  '/offers': {
    get: operation('Lister les offres visibles par le compte'),
    post: operation('Créer un brouillon d’offre vendeur', { body: true })
  },
  '/offers/{id}': { get: operation('Lire une offre accessible', { ids: ['id'] }) },
  '/offers/{id}/submit': { post: operation('Soumettre une offre', { ids: ['id'] }) },
  '/offers/{id}/status': { patch: operation('Présélectionner, rejeter ou attribuer une offre', { body: true, ids: ['id'] }) },
  '/catalog/categories': {
    get: operation('Lister les catégories'),
    post: operation('Créer une catégorie', { body: true })
  },
  '/catalog/products': {
    get: operation('Rechercher dans le catalogue pharmaceutique'),
    post: operation('Créer un produit vendeur', { body: true })
  },
  '/catalog/products/{id}': {
    put: operation('Modifier un produit vendeur', { body: true, ids: ['id'] }),
    delete: operation('Supprimer un produit vendeur', { ids: ['id'] })
  },
  '/documents': { get: operation('Lister les documents accessibles') },
  '/documents/upload-url': {
    post: operation('Créer un document et générer un formulaire de dépôt privé (20 Mo maximum)', { body: true })
  },
  '/documents/{id}/complete': {
    post: operation('Vérifier le fichier privé et finaliser son dépôt', { ids: ['id'] })
  },
  '/documents/{id}/download-url': {
    get: operation('Générer une URL de téléchargement temporaire après contrôle d’accès', { ids: ['id'] })
  },
  '/documents/{id}': {
    delete: operation('Supprimer un document privé appartenant à l’organisation', { ids: ['id'] })
  },
  '/documents/{id}/verification': {
    patch: operation('Modifier le statut de vérification d’un document', { body: true, ids: ['id'] })
  },
  '/collaboration/tenders/{tenderId}/clarifications': {
    get: operation('Lire les demandes de clarification publiques', { ids: ['tenderId'] }),
    post: operation('Poser une question de clarification', { body: true, ids: ['tenderId'] })
  },
  '/collaboration/clarifications/{id}/answer': {
    post: operation('Répondre à une demande de clarification', { body: true, ids: ['id'] })
  },
  '/collaboration/offers/{offerId}/messages': {
    get: operation('Lire les messages privés d’une offre', { ids: ['offerId'] }),
    post: operation('Envoyer un message privé de négociation', { body: true, ids: ['offerId'] })
  },
  '/collaboration/offers/{offerId}/participants': {
    get: operation('Lister les participants à une négociation', { ids: ['offerId'] })
  },
  '/collaboration/messages/{id}/read': {
    patch: operation('Marquer un message comme lu', { ids: ['id'] })
  },
  '/purchase-orders': { get: operation('Lister les bons de commande accessibles') },
  '/purchase-orders/{id}/status': {
    patch: operation('Mettre à jour le statut d’un bon de commande', { body: true, ids: ['id'] })
  },
  '/notifications': { get: operation('Lister les notifications du compte') },
  '/notifications/{id}/read': { patch: operation('Marquer une notification comme lue', { ids: ['id'] }) }
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'MediTender API',
    version: '1.0.0',
    description: 'API de passation d’appels d’offres pharmaceutiques entre acheteurs et vendeurs.'
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
