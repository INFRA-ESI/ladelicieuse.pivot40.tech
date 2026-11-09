// ── Schémas réutilisables ─────────────────────────────────────────────────────

const SuccessEnvelope = (dataSchema: object) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  },
});

const PaginatedEnvelope = (dataSchema: object) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data:    { type: 'array', items: dataSchema },
    total:   { type: 'integer', example: 120 },
    page:    { type: 'integer', example: 1 },
    pages:   { type: 'integer', example: 3 },
  },
});

const ErrorResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Erreur serveur interne' },
    error:   { type: 'string' },
  },
};

// ── Document OpenAPI ──────────────────────────────────────────────────────────

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'La Délicieuse Diète — API Backend',
    version: '1.0.0',
    description: `
API RESTful du backend La Délicieuse Diète.

**Authentification :** Bearer JWT — obtenu via \`POST /api/auth/verify-otp\`.

**Base URL :** \`http://localhost:3000\`
    `.trim(),
    contact: { name: 'Lead Backend', email: 'nemrodsalami1809@gmail.com' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Développement local' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenu après vérification OTP',
      },
    },
    schemas: {
      Error: ErrorResponse,

      // ── Auth ──
      OtpRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'admin@ladelicieuse.ga' },
          password: { type: 'string', example: 'motdepasse' },
        },
      },
      OtpVerify: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          otp:   { type: 'string', example: '123456' },
        },
      },

      // ── Paiement ──
      PaymentInit: {
        type: 'object',
        required: ['amount', 'orderId', 'method'],
        properties: {
          amount:        { type: 'number', example: 4500 },
          orderId:       { type: 'string', example: 'ORDER-1234567890' },
          method:        { type: 'string', enum: ['mobile_money', 'card', 'paypal', 'maviance'] },
          provider:      { type: 'string', enum: ['airtel', 'moov'], description: 'Requis si method=mobile_money' },
          phone:         { type: 'string', example: '24177123456', description: 'Requis pour mobile_money' },
          customerName:  { type: 'string', example: 'Jean Dupont' },
          customerEmail: { type: 'string', format: 'email' },
          description:   { type: 'string' },
          successUrl:    { type: 'string', format: 'uri' },
          cancelUrl:     { type: 'string', format: 'uri' },
        },
      },

      // ── Commande ──
      Order: {
        type: 'object',
        properties: {
          _id:     { type: 'string' },
          numero:  { type: 'string', example: 'LDD-0042' },
          statut:  { type: 'string', enum: ['en_attente','confirmee','en_preparation','prete','en_livraison','livree','annulee','remboursee'] },
          priorite:{ type: 'string', enum: ['normale','haute','urgente'] },
          total:   { type: 'number', example: 9500 },
          client: {
            type: 'object',
            properties: {
              nom:       { type: 'string' },
              email:     { type: 'string', format: 'email' },
              telephone: { type: 'string' },
            },
          },
          articles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                repasId: { type: 'string' },
                nom:     { type: 'string' },
                prix:    { type: 'number' },
                qte:     { type: 'integer' },
              },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Repas ──
      Meal: {
        type: 'object',
        properties: {
          _id:         { type: 'string' },
          nom:         { type: 'string', example: 'Salade César' },
          description: { type: 'string' },
          prix:        { type: 'number', example: 3500 },
          categorie:   { type: 'string', example: 'Salade' },
          disponible:  { type: 'boolean', example: true },
          popular:     { type: 'boolean', example: false },
          image:       { type: 'string', format: 'uri' },
          calories:    { type: 'integer', example: 450 },
        },
      },

      // ── Utilisateur (client) ──
      User: {
        type: 'object',
        properties: {
          _id:       { type: 'string' },
          nom:       { type: 'string' },
          email:     { type: 'string', format: 'email' },
          telephone: { type: 'string' },
          statut:    { type: 'string', enum: ['actif','inactif','suspendu'] },
          tier:      { type: 'string', enum: ['bronze','argent','or','platine'] },
          points:    { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },

  // ── Tags ─────────────────────────────────────────────────────────────────────
  tags: [
    { name: 'Auth',          description: 'Authentification admin (OTP par email)' },
    { name: 'Paiements',     description: 'SingPay — Airtel Money, Moov Money, Carte, PayPal' },
    { name: 'Commandes',     description: 'Gestion des commandes clients' },
    { name: 'Repas',         description: 'Catalogue des repas' },
    { name: 'Catégories',    description: 'Catégories de repas' },
    { name: 'Ingrédients',   description: 'Ingrédients et stocks' },
    { name: 'Fournisseurs',  description: 'Fournisseurs' },
    { name: 'Menu du jour',  description: 'Menu journalier' },
    { name: 'Promotions',    description: 'Codes promo et promotions' },
    { name: 'Utilisateurs',  description: 'Clients enregistrés (admin)' },
    { name: 'Client',        description: 'Espace client (inscription, profil, fidélité)' },
    { name: 'Avis',          description: 'Avis et notes clients' },
    { name: 'Factures',      description: 'Facturation' },
    { name: 'Stocks',        description: 'Gestion des stocks et réapprovisionnement' },
    { name: 'Abonnements',   description: 'Plans d\'abonnement' },
    { name: 'Dashboard',     description: 'Statistiques et KPIs back-office' },
    { name: 'Fidélité',      description: 'Programme de fidélité et points' },
    { name: 'Notifications', description: 'Push notifications' },
    { name: 'Paramètres',    description: 'Configuration de l\'application' },
    { name: 'Historique',    description: 'Journal des actions admin' },
    { name: 'Upload',        description: 'Upload de fichiers / images' },
    { name: 'Santé',         description: 'Health check' },
  ],

  paths: {

    // ══════════════════════════════════════════════════════════════════════════
    // SANTÉ
    // ══════════════════════════════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['Santé'],
        summary: 'Health check',
        responses: {
          200: { description: 'Serveur opérationnel', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, timestamp: { type: 'string', format: 'date-time' } } } } } },
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // AUTH
    // ══════════════════════════════════════════════════════════════════════════
    '/api/auth/request-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Demander un OTP (étape 1)',
        description: 'Valide email + mot de passe, envoie un code OTP à 6 chiffres par email. Limité à 3 tentatives / 15 min.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpRequest' } } } },
        responses: {
          200: { description: 'OTP envoyé', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, expiresIn: { type: 'integer', example: 300 } } } } } },
          400: { description: 'Champs manquants' },
          401: { description: 'Identifiants invalides' },
          429: { description: 'Trop de tentatives' },
        },
      },
    },
    '/api/auth/verify-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Vérifier l\'OTP et obtenir le JWT (étape 2)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpVerify' } } } },
        responses: {
          200: {
            description: 'Connexion réussie — JWT retourné',
            content: { 'application/json': { schema: { type: 'object', properties: {
              success: { type: 'boolean' },
              token:   { type: 'string', description: 'JWT valable 24h' },
              user:    { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } } },
            } } } },
          },
          401: { description: 'OTP invalide' },
          400: { description: 'OTP expiré ou trop de tentatives' },
        },
      },
    },
    '/api/auth/refresh-token': {
      post: {
        tags: ['Auth'],
        summary: 'Renouveler le JWT',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Nouveau token émis' },
          401: { description: 'Token invalide ou expiré' },
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PAIEMENTS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/payments/singpay/init': {
      post: {
        tags: ['Paiements'],
        summary: 'Initier un paiement',
        description: 'Supporte : `mobile_money` (Airtel / Moov), `card`, `paypal`, `maviance`.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInit' } } } },
        responses: {
          200: { description: 'Paiement initié', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: {
            transactionId: { type: 'string' },
            status:        { type: 'string', enum: ['pending','processing'] },
            paymentUrl:    { type: 'string', format: 'uri', description: 'Lien de paiement (carte / PayPal)' },
            message:       { type: 'string' },
            expiresAt:     { type: 'string', format: 'date-time' },
          } }) } } },
          400: { description: 'Paramètres invalides ou erreur SingPay', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Paiement déjà en cours pour cette commande' },
        },
      },
    },
    '/api/payments/singpay/check/{transactionId}': {
      get: {
        tags: ['Paiements'],
        summary: 'Vérifier le statut d\'une transaction',
        parameters: [{ name: 'transactionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Statut retourné', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: {
            transactionId: { type: 'string' },
            orderId:       { type: 'string' },
            status:        { type: 'string', enum: ['pending','processing','success','failed','cancelled','timeout'] },
            amount:        { type: 'number' },
            provider:      { type: 'string' },
            paidAt:        { type: 'string', format: 'date-time' },
            isComplete:    { type: 'boolean' },
            message:       { type: 'string' },
          } }) } } },
          404: { description: 'Transaction introuvable' },
        },
      },
    },
    '/api/payments/singpay/cash': {
      post: {
        tags: ['Paiements'],
        summary: 'Confirmer un paiement en espèces',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['orderId'], properties: {
            orderId: { type: 'string' },
            amount:  { type: 'number' },
          } } } },
        },
        responses: {
          200: { description: 'Paiement cash confirmé' },
          400: { description: 'Erreur' },
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // COMMANDES
    // ══════════════════════════════════════════════════════════════════════════
    '/api/orders': {
      get: {
        tags: ['Commandes'],
        summary: 'Liste paginée des commandes',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'statut',   in: 'query', schema: { type: 'string', enum: ['en_attente','confirmee','en_preparation','prete','en_livraison','livree','annulee','remboursee','tous'] } },
          { name: 'priorite', in: 'query', schema: { type: 'string', enum: ['normale','haute','urgente','tous'] } },
          { name: 'search',   in: 'query', schema: { type: 'string' }, description: 'Nom, email ou numéro commande' },
          { name: 'date',     in: 'query', schema: { type: 'string', enum: ['today'] } },
          { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',    in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'Liste paginée', content: { 'application/json': { schema: PaginatedEnvelope({ $ref: '#/components/schemas/Order' }) } } },
        },
      },
      post: {
        tags: ['Commandes'],
        summary: 'Créer une commande',
        description: 'Endpoint public — appelé depuis le parcours d\'achat client.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: {
          201: { description: 'Commande créée' },
          400: { description: 'Données invalides' },
        },
      },
    },
    '/api/orders/stats': {
      get: {
        tags: ['Commandes'],
        summary: 'Statistiques des commandes du jour',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Stats retournées', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: {
            today:     { type: 'object', properties: { revenu: { type: 'number' }, count: { type: 'integer' } } },
            parStatut: { type: 'object', additionalProperties: { type: 'integer' } },
          } }) } } },
        },
      },
    },
    '/api/orders/{id}': {
      get: {
        tags: ['Commandes'],
        summary: 'Détail d\'une commande',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Commande trouvée', content: { 'application/json': { schema: SuccessEnvelope({ $ref: '#/components/schemas/Order' }) } } },
          404: { description: 'Commande introuvable' },
        },
      },
    },
    '/api/orders/{id}/status': {
      patch: {
        tags: ['Commandes'],
        summary: 'Mettre à jour le statut d\'une commande',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['statut'], properties: {
          statut: { type: 'string', enum: ['confirmee','en_preparation','prete','en_livraison','livree','annulee'] },
          note:   { type: 'string' },
          par:    { type: 'string', example: 'Admin' },
        } } } } },
        responses: {
          200: { description: 'Statut mis à jour — notification WhatsApp envoyée' },
          404: { description: 'Commande introuvable' },
        },
      },
    },
    '/api/orders/{id}/priority': {
      patch: {
        tags: ['Commandes'],
        summary: 'Modifier la priorité d\'une commande',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { priorite: { type: 'string', enum: ['normale','haute','urgente'] } } } } } },
        responses: { 200: { description: 'Priorité mise à jour' } },
      },
    },
    '/api/orders/{id}/anomalie': {
      post: {
        tags: ['Commandes'],
        summary: 'Signaler une anomalie (annulation / remboursement)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type','raison'], properties: {
          type:    { type: 'string', enum: ['annulation','remboursement'] },
          raison:  { type: 'string' },
          montant: { type: 'number' },
        } } } } },
        responses: { 200: { description: 'Anomalie enregistrée' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // REPAS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/meals': {
      get: {
        tags: ['Repas'],
        summary: 'Liste des repas disponibles (public)',
        parameters: [
          { name: 'categorie', in: 'query', schema: { type: 'string' } },
          { name: 'popular',   in: 'query', schema: { type: 'boolean' } },
          { name: 'search',    in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Repas retournés', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: { $ref: '#/components/schemas/Meal' } }) } } } },
      },
      post: {
        tags: ['Repas'],
        summary: 'Créer un repas',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Meal' } } } },
        responses: { 201: { description: 'Repas créé' } },
      },
    },
    '/api/meals/admin': {
      get: {
        tags: ['Repas'],
        summary: 'Liste admin (tous statuts)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'categorie',  in: 'query', schema: { type: 'string' } },
          { name: 'search',     in: 'query', schema: { type: 'string' } },
          { name: 'disponible', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Repas retournés' } },
      },
    },
    '/api/meals/{id}': {
      put: {
        tags: ['Repas'],
        summary: 'Modifier un repas',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Meal' } } } },
        responses: { 200: { description: 'Repas mis à jour' }, 404: { description: 'Introuvable' } },
      },
      delete: {
        tags: ['Repas'],
        summary: 'Supprimer un repas',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Repas supprimé' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CATÉGORIES
    // ══════════════════════════════════════════════════════════════════════════
    '/api/categories': {
      get: {
        tags: ['Catégories'],
        summary: 'Liste des catégories (public)',
        responses: { 200: { description: 'Catégories retournées' } },
      },
      post: {
        tags: ['Catégories'],
        summary: 'Créer une catégorie',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom'], properties: { nom: { type: 'string' }, description: { type: 'string' } } } } } },
        responses: { 201: { description: 'Catégorie créée' } },
      },
    },
    '/api/categories/{id}': {
      put: {
        tags: ['Catégories'],
        summary: 'Modifier une catégorie',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nom: { type: 'string' } } } } } },
        responses: { 200: { description: 'Mise à jour effectuée' } },
      },
      delete: {
        tags: ['Catégories'],
        summary: 'Supprimer une catégorie',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Supprimée' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // UTILISATEURS (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    '/api/users': {
      get: {
        tags: ['Utilisateurs'],
        summary: 'Liste paginée des clients',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'search',  in: 'query', schema: { type: 'string' } },
          { name: 'statut',  in: 'query', schema: { type: 'string', enum: ['actif','inactif','suspendu','tous'] } },
          { name: 'tier',    in: 'query', schema: { type: 'string', enum: ['bronze','argent','or','platine','tous'] } },
          { name: 'page',    in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',   in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { 200: { description: 'Clients retournés', content: { 'application/json': { schema: PaginatedEnvelope({ $ref: '#/components/schemas/User' }) } } } },
      },
    },
    '/api/users/stats': {
      get: {
        tags: ['Utilisateurs'],
        summary: 'Statistiques globales clients',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Stats retournées' } },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['Utilisateurs'],
        summary: 'Détail d\'un client',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Client trouvé' }, 404: { description: 'Introuvable' } },
      },
      patch: {
        tags: ['Utilisateurs'],
        summary: 'Modifier un client',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        responses: { 200: { description: 'Mis à jour' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CLIENT (espace public)
    // ══════════════════════════════════════════════════════════════════════════
    '/api/client/register': {
      post: {
        tags: ['Client'],
        summary: 'Inscription client',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nom','email','password'], properties: {
          nom:       { type: 'string' },
          email:     { type: 'string', format: 'email' },
          password:  { type: 'string', minLength: 6 },
          telephone: { type: 'string' },
        } } } } },
        responses: { 201: { description: 'Compte créé, email de vérification envoyé' }, 409: { description: 'Email déjà utilisé' } },
      },
    },
    '/api/client/login': {
      post: {
        tags: ['Client'],
        summary: 'Connexion client',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } },
        responses: { 200: { description: 'JWT client retourné' }, 401: { description: 'Identifiants invalides' } },
      },
    },
    '/api/client/profile': {
      get: {
        tags: ['Client'],
        summary: 'Profil du client connecté',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Profil retourné' } },
      },
      patch: {
        tags: ['Client'],
        summary: 'Mettre à jour le profil',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nom: { type: 'string' }, telephone: { type: 'string' } } } } } },
        responses: { 200: { description: 'Profil mis à jour' } },
      },
    },
    '/api/client/fidelite': {
      get: {
        tags: ['Client'],
        summary: 'Historique fidélité du client',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Points et transactions retournés' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // MENU DU JOUR
    // ══════════════════════════════════════════════════════════════════════════
    '/api/menu': {
      get: {
        tags: ['Menu du jour'],
        summary: 'Menu actif du jour (public)',
        responses: { 200: { description: 'Menu retourné' } },
      },
      post: {
        tags: ['Menu du jour'],
        summary: 'Créer ou mettre à jour le menu du jour',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { date: { type: 'string', format: 'date' }, repas: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { 200: { description: 'Menu mis à jour' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PROMOTIONS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/promotions': {
      get: {
        tags: ['Promotions'],
        summary: 'Liste des promotions',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Promotions retournées' } },
      },
      post: {
        tags: ['Promotions'],
        summary: 'Créer une promotion ou un code promo',
        security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Promotion créée' } },
      },
    },
    '/api/promotions/validate': {
      post: {
        tags: ['Promotions'],
        summary: 'Valider un code promo (public)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string' }, montant: { type: 'number' } } } } } },
        responses: { 200: { description: 'Code valide — remise retournée' }, 400: { description: 'Code invalide ou expiré' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // DASHBOARD
    // ══════════════════════════════════════════════════════════════════════════
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'KPIs et statistiques globales',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Données dashboard retournées' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // STOCKS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/stocks': {
      get: {
        tags: ['Stocks'],
        summary: 'État des stocks',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Stocks retournés' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ABONNEMENTS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/subscriptions': {
      get: {
        tags: ['Abonnements'],
        summary: 'Liste des abonnements',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Abonnements retournés' } },
      },
      post: {
        tags: ['Abonnements'],
        summary: 'Créer un abonnement',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { plan: { type: 'string' }, userId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Abonnement créé' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // FIDÉLITÉ
    // ══════════════════════════════════════════════════════════════════════════
    '/api/fidelite/{userId}': {
      get: {
        tags: ['Fidélité'],
        summary: 'Solde et historique de points d\'un client',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Points et tier retournés' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // INGRÉDIENTS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/ingredients': {
      get: {
        tags: ['Ingrédients'],
        summary: 'Liste des ingrédients',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Ingrédients retournés' } },
      },
      post: {
        tags: ['Ingrédients'],
        summary: 'Créer un ingrédient',
        security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Ingrédient créé' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // FOURNISSEURS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/suppliers': {
      get: {
        tags: ['Fournisseurs'],
        summary: 'Liste des fournisseurs',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Fournisseurs retournés' } },
      },
      post: {
        tags: ['Fournisseurs'],
        summary: 'Ajouter un fournisseur',
        security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Fournisseur créé' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // AVIS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/reviews': {
      get: {
        tags: ['Avis'],
        summary: 'Liste des avis clients',
        responses: { 200: { description: 'Avis retournés' } },
      },
      post: {
        tags: ['Avis'],
        summary: 'Soumettre un avis',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['note'], properties: { note: { type: 'integer', minimum: 1, maximum: 5 }, commentaire: { type: 'string' } } } } } },
        responses: { 201: { description: 'Avis enregistré' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // FACTURES
    // ══════════════════════════════════════════════════════════════════════════
    '/api/invoices': {
      get: {
        tags: ['Factures'],
        summary: 'Liste des factures',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Factures retournées' } },
      },
    },
    '/api/invoices/{id}': {
      get: {
        tags: ['Factures'],
        summary: 'Télécharger une facture',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PDF facture' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // HISTORIQUE
    // ══════════════════════════════════════════════════════════════════════════
    '/api/history': {
      get: {
        tags: ['Historique'],
        summary: 'Journal des actions admin',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { 200: { description: 'Logs retournés' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ══════════════════════════════════════════════════════════════════════════
    '/api/notifications/subscribe': {
      post: {
        tags: ['Notifications'],
        summary: 'Abonner un device aux push notifications',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { subscription: { type: 'object' } } } } } },
        responses: { 200: { description: 'Abonnement enregistré' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PARAMÈTRES
    // ══════════════════════════════════════════════════════════════════════════
    '/api/settings': {
      get: {
        tags: ['Paramètres'],
        summary: 'Lire la configuration de l\'application',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Paramètres retournés' } },
      },
      patch: {
        tags: ['Paramètres'],
        summary: 'Mettre à jour la configuration',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Paramètres mis à jour' } },
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ══════════════════════════════════════════════════════════════════════════
    '/api/upload': {
      post: {
        tags: ['Upload'],
        summary: 'Uploader une image',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'URL de l\'image retournée' } },
      },
    },
  },
};

// ── Options UI Swagger ────────────────────────────────────────────────────────

export const swaggerUiOptions: Record<string, unknown> = {
  customCss: `
    .swagger-ui .topbar { background-color: #166534; }
    .swagger-ui .topbar .topbar-wrapper .link { color: #fff; }
    .swagger-ui .opblock-tag { font-size: 15px; }
    .swagger-ui .info h2.title { color: #166534; }
    .swagger-ui .btn.authorize { background-color: #166534; border-color: #166534; color: #fff; }
  `,
  customSiteTitle: 'La Délicieuse Diète — API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
};
