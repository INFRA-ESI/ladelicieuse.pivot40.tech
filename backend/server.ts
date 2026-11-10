import express from 'express';
import { createServer, type IncomingHttpHeaders } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { connectDB } from './config/database.js';
import { connectRedis, getRedis } from './config/redis.js';
import { validateConfig } from './config/singpay.config.js';
import { assertProductionConfig } from './config/production.config.js';
import { swaggerDocument, swaggerUiOptions } from './config/swagger.config.js';
import { logger } from './config/logger.js';
import { frontendUrls } from './config/frontendUrl.js';

// Routes
import paymentRoutes       from './routes/payment.routes.js';
import authRoutes          from './routes/auth.routes.js';
import clientRoutes        from './routes/client.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import ordersRoutes        from './routes/orders.routes.js';
import usersRoutes         from './routes/users.routes.js';
import categoriesRoutes    from './routes/categories.routes.js';
import ingredientsRoutes   from './routes/ingredients.routes.js';
import suppliersRoutes     from './routes/suppliers.routes.js';
import mealsRoutes         from './routes/meals.routes.js';
import menuRoutes          from './routes/menu.routes.js';
import promotionsRoutes    from './routes/promotions.routes.js';
import invoicesRoutes      from './routes/invoices.routes.js';
import historyRoutes       from './routes/history.routes.js';
import stocksRoutes        from './routes/stocks.routes.js';
import subscriptionsRoutes from './routes/subscriptions.routes.js';
import dashboardRoutes     from './routes/dashboard.routes.js';
import uploadRoutes        from './routes/upload.routes.js';
import suggestionsRoutes   from './routes/suggestions.routes.js';
import settingsRoutes      from './routes/settings.routes.js';
import fideliteRoutes      from './routes/fidelite.routes.js';
import consultationsRoutes from './routes/consultations.routes.js';
import plansRoutes         from './routes/plans.routes.js';
import faqsRoutes          from './routes/faqs.routes.js';
import testimonialsRoutes        from './routes/testimonials.routes.js';
import trackingRoutes            from './routes/tracking.routes.js';
import consultationBookingsRoutes from './routes/consultationBookings.routes.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import Settings from './models/Settings.model.js';
import { initRealtime, closeRealtime } from './services/realtime.service.js';
import { migratePlansToWeekly, migrateConsultationsPresentielPrice, migrateOrderNumbersToLdd, backfillMealNutrition } from './services/migrations.service.js';
import { memoryRateLimiter } from './middleware/rateLimiter.js';
import { hideInternalErrors } from './middleware/hideInternalErrors.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app        = express();
const httpServer = createServer(app);
const PORT       = process.env.PORT || 3000;

// Derrière nginx : `req.ip` doit être l'adresse du client (en-tête posé par nginx), pas celle du proxy.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      // Les polices de la marque viennent de Google Fonts : la feuille de style (googleapis) et les fichiers (gstatic).
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      connectSrc:  ["'self'", "https:", "wss:"],
      fontSrc:     ["'self'", "data:", "https://fonts.gstatic.com"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ── CORS — whitelist explicite ────────────────────────────────────────────────
const allowedOrigins: string[] = [];
if (process.env.NODE_ENV !== 'production') {
  // Vite bascule sur le port suivant disponible (5101, 5102…) si 5100 est occupé —
  // on autorise donc une petite plage de ports de dev plutôt qu'un seul port fixe.
  allowedOrigins.push(
    'http://localhost:5100', 'http://localhost:5101', 'http://localhost:5102',
    'http://localhost:3000',
  );
}
if (frontendUrls().length > 0) {
  for (const url of frontendUrls()) {
    try {
      if (['http:', 'https:'].includes(new URL(url).protocol)) {
        allowedOrigins.push(url);
      } else {
        logger.error(`[CORS] FRONTEND_URL protocole invalide: "${url}" — ignoré`);
      }
    } catch {
      logger.error(`[CORS] FRONTEND_URL mal formé: "${url}" — ignoré`);
    }
  }
} else if (process.env.NODE_ENV === 'production') {
  logger.error('[CORS] FRONTEND_URL non défini en production — aucune origine externe autorisée !');
}

// Un navigateur envoie l'en-tête Origin sur tout POST, même vers le site qui l'a servi.
// Une requête same-origin ne doit donc jamais être refusée, même si FRONTEND_URL est absent
// ou mal renseigné : sinon tous les POST du site (dont la connexion admin) tombent en erreur.
const isSameOrigin = (headers: IncomingHttpHeaders, origin: string): boolean => {
  const host = (headers['x-forwarded-host'] as string | undefined)?.split(',')[0].trim() ?? headers.host;
  try { return !!host && new URL(origin).host === host; } catch { return false; }
};
// Sans en-tête Origin (client non navigateur), la requête passe : le jeton reste exigé là où il le faut.
const isOriginAllowed = (origin: string | undefined, headers: IncomingHttpHeaders): boolean =>
  !origin || allowedOrigins.includes(origin) || isSameOrigin(headers, origin);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin, req.headers)) {
    logger.warn(`[CORS] Origine refusée: ${origin}`);
    res.status(403).json({ success: false, message: 'Origine non autorisée' });
    return;
  }
  next();
});
// Seules les origines autorisées par le filtre ci-dessus arrivent ici : on peut les refléter.
app.use(cors({ origin: true, credentials: true }));

// ── Documentation Swagger (dev uniquement) ────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));
}

// ── Routes ────────────────────────────────────────────────────────────────────
// En production, les messages techniques (`error`) ne sortent plus vers le client : ils sont journalisés.
app.use('/api', hideInternalErrors);

// Filet global anti-flood : 600 requêtes/min par IP, très au-dessus d'une navigation normale
// (une page en émet une dizaine), mais large pour ne pas bloquer les IP partagées (réseaux mobiles).
app.use('/api', memoryRateLimiter(600, 60, 'api-global'));

app.use('/api/payments',      paymentRoutes);
app.use('/api/auth',          authRoutes);
app.use('/api/client',        clientRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/orders',        ordersRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/categories',    categoriesRoutes);
app.use('/api/ingredients',   ingredientsRoutes);
app.use('/api/suppliers',     suppliersRoutes);
app.use('/api/meals',         mealsRoutes);
app.use('/api/menu',          menuRoutes);
app.use('/api/promotions',    promotionsRoutes);
app.use('/api/invoices',      invoicesRoutes);
app.use('/api/history',       historyRoutes);
app.use('/api/stocks',        stocksRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/upload',        uploadRoutes);
app.use('/api/suggestions',   suggestionsRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/fidelite',       fideliteRoutes);
app.use('/api/consultations',  consultationsRoutes);
app.use('/api/plans',          plansRoutes);
app.use('/api/faqs',           faqsRoutes);
app.use('/api/testimonials',          testimonialsRoutes);
app.use('/api/tracking',             trackingRoutes);
app.use('/api/consultation-bookings', consultationBookingsRoutes);

// ── Health checks ─────────────────────────────────────────────────────────────
// /health/live  → liveness  : le process est-il vivant ? (toujours 200 si le serveur tourne)
// /health/ready → readiness : MongoDB + Redis répondent-ils ? (200 = prêt à recevoir du trafic)
app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  // MongoDB — readyState 1 = connecté
  const mongoState = mongoose.connection.readyState;
  checks.mongodb = mongoState === 1 ? 'ok' : 'down';
  if (mongoState !== 1) healthy = false;

  // Redis
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
      healthy = false;
    }
  } else {
    checks.redis = 'unavailable';
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Rétrocompatibilité — ancienne route /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Frontend statique (production) ────────────────────────────────────────────
// Le dossier du site se trouve à un niveau différent selon qu'on lance le TypeScript (backend/server.ts) ou le fichier
// compilé (backend/dist/server.js) : on prend le premier qui contient réellement un index.html.
const FRONTEND_DIST_CANDIDATES = [path.join(__dirname, '..', 'dist'), path.join(__dirname, '..', '..', 'dist')];
const FRONTEND_DIST = FRONTEND_DIST_CANDIDATES.find(dir => fs.existsSync(path.join(dir, 'index.html'))) ?? FRONTEND_DIST_CANDIDATES[0];
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST, {
    // Les fichiers de /assets portent un hash dans leur nom : leur contenu ne change jamais sous un même nom,
    // le navigateur peut les garder un an sans revalider (une revalidation coûte un aller-retour réseau par fichier).
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
}

// ── 404 API — uniquement pour les routes /api/* non trouvées ──────────────────
app.use('/api', (req: express.Request, res: express.Response) => {
  res.status(404).json({ success: false, message: 'Endpoint non trouvé', path: req.path });
});

// ── SPA catch-all — toutes les routes non-API → index.html ───────────────────
app.get('*', (_req: express.Request, res: express.Response) => {
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Serveur API opérationnel. Lancez le frontend séparément en développement.');
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Erreur serveur non interceptée', { message: error.message });

  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    ...(process.env.NODE_ENV !== 'production' && { error: error.message }),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// ── Seed du hash admin au premier démarrage ───────────────────────────────────
async function seedAdminPasswordHash(): Promise<void> {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) {
    logger.warn('[Auth] ADMIN_PASSWORD non défini — connexion admin désactivée.');
    return;
  }
  const settings = await Settings.findOne().select('+adminPasswordHash');
  if (settings?.adminPasswordHash) return;

  const hash = await bcrypt.hash(pwd, 12);
  if (settings) {
    settings.adminPasswordHash = hash;
    await settings.save();
  } else {
    await Settings.create({ adminPasswordHash: hash });
  }
  logger.info('[Auth] Hash admin initialisé en base.');
}

async function start() {
  assertProductionConfig();
  await connectDB();
  await connectRedis();
  validateConfig();
  await seedAdminPasswordHash();
  await migratePlansToWeekly();
  await migrateConsultationsPresentielPrice();
  await migrateOrderNumbersToLdd();
  await backfillMealNutrition();
  initRealtime(httpServer, { isOriginAllowed: (origin, req) => isOriginAllowed(origin, req.headers) });
  httpServer.listen(PORT, () => {
    logger.info(`Serveur lancé sur http://localhost:${PORT}`);
    logger.info(`CORS activé pour ${frontendUrls().join(', ') || 'http://localhost:5100'}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`[shutdown] Signal ${signal} reçu — arrêt gracieux en cours…`);
  closeRealtime();
  httpServer.close(async () => {
    try {
      await mongoose.connection.close();
      logger.info('[shutdown] MongoDB fermé.');
    } catch (err) {
      logger.error('[shutdown] Erreur fermeture MongoDB', { message: (err as Error).message });
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('[shutdown] Délai dépassé — forçage sortie.');
    process.exit(1);
  }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();

export default app;
