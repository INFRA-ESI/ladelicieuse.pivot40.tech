# La Délicieuse Diète

[![CI](https://github.com/INFRA-ESI/ladelicieuse.pivot40.tech/actions/workflows/ci.yml/badge.svg)](https://github.com/INFRA-ESI/ladelicieuse.pivot40.tech/actions/workflows/ci.yml)
[![E2E](https://github.com/INFRA-ESI/ladelicieuse.pivot40.tech/actions/workflows/e2e.yml/badge.svg)](https://github.com/INFRA-ESI/ladelicieuse.pivot40.tech/actions/workflows/e2e.yml)

Application web de commande en ligne pour **La Délicieuse Diète**, bar à salades et restaurant diététique de Libreville (Gabon) : salades composées sur mesure, jus détox, repas équilibrés, abonnements et consultations avec un diététicien. Le dépôt contient le site client, le back-office d'administration et l'API.

Site : <https://ladelicieuse.pivot40.tech>

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Tests et qualité](#tests-et-qualité)
- [Intégration continue et déploiement](#intégration-continue-et-déploiement)
- [Sécurité](#sécurité)
- [Documentation](#documentation)

## Fonctionnalités

**Site client**
- Composition de salades ingrédient par ingrédient, avec calcul du prix et des calories ; catalogue de jus (formats 1 L / 250 ml) et de repas.
- Panier, choix de la livraison (zones, créneau) ou du retrait, puis paiement : Mobile Money (Airtel Money, Moov Money), carte bancaire ou espèces, via la passerelle SingPay.
- Suivi de commande en temps réel (Socket.IO), reçu et notification WhatsApp.
- Compte client avec programme de fidélité par paliers, historique des commandes et préférences.
- Abonnements hebdomadaires ou mensuels, avec devis signé côté serveur.
- Prise de rendez-vous avec le diététicien (téléconsultation ou présentiel).
- Application web installable (PWA) et notifications push.

**Back-office**
- Tableau de bord et rapports de ventes, commandes en direct, menu du jour, catalogue (catégories, ingrédients, stocks), promotions, factures, abonnements, consultations, avis clients, utilisateurs, paramètres de livraison et du site.
- Connexion administrateur sécurisée par code reçu par e-mail.

**Qualité de service**
- Mesure des Core Web Vitals (LCP, INP, CLS) respectueuse de la vie privée, désactivée tant qu'aucune adresse de collecte n'est configurée.
- Sondes de santé `/health/live` et `/health/ready`, arrêt propre du serveur, limitation de débit, en-têtes de sécurité.

## Stack technique

| Couche | Technologies |
|---|---|
| Front-end | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix UI), React Router, Framer Motion, Recharts, React Hook Form + Zod |
| Back-end | Node.js, Express 4, TypeScript, Mongoose 8, Socket.IO, JWT, Zod, Helmet |
| Données | MongoDB ; Redis (Upstash) en option pour le cache et la limitation de débit |
| Services | SingPay (paiements), Nodemailer (e-mails transactionnels), Web Push (VAPID) |
| Qualité | ESLint, Vitest (front et back), Playwright (E2E), GitHub Actions |

## Architecture

```
.
├── src/                  Application React
│   ├── pages/            Pages publiques et pages d'administration (pages/admin)
│   ├── components/       Composants (UI shadcn dans components/ui)
│   ├── context/          Panier et utilisateur
│   ├── hooks/ lib/       Hooks, formatage FCFA, mesure Web Vitals, utilitaires
│   └── services/         Appels à l'API
├── backend/              API Express
│   ├── routes/           Une route par domaine métier (commandes, paiements, menu…)
│   ├── models/           Schémas Mongoose
│   ├── services/         Logique métier (devis, migrations, temps réel…)
│   ├── middleware/       Authentification, limitation de débit, erreurs
│   ├── scripts/          Jeu de données de démonstration (seed)
│   └── tests/            Tests unitaires et d'intégration
├── tests/                Tests E2E Playwright
├── docs/                 Documentation complémentaire
└── .github/workflows/    CI, E2E et déploiement
```

## Démarrage rapide

**Prérequis** : Node.js 20 ou plus récent, npm, et une instance MongoDB (locale ou distante).

```bash
# 1. Dépendances
npm install
npm install --prefix backend

# 2. Configuration (voir la section suivante)
cp .env.example .env
cp backend/.env.example backend/.env

# 3. Données de démonstration (facultatif)
npm run seed --prefix backend

# 4. Lancement : API sur :3000, site sur :5100
npm run dev --prefix backend      # terminal 1
npm run dev                       # terminal 2
```

Le serveur de développement du site relaie `/api`, `/uploads` et `/socket.io` vers l'API (`DEV_API_TARGET` permet de changer la cible, `http://localhost:3000` par défaut).

## Configuration

Les variables sont documentées, avec des valeurs d'exemple, dans [`.env.example`](.env.example) (site) et [`backend/.env.example`](backend/.env.example) (API). Les indispensables :

| Variable | Rôle |
|---|---|
| `MONGO_URI` | Connexion MongoDB |
| `JWT_SECRET` | Secret de signature des jetons (64 octets aléatoires en production) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte administrateur initial |
| `FRONTEND_URL` | Origine autorisée (CORS) |
| `SINGPAY_*` | Identifiants de la passerelle de paiement |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD` | Envoi des e-mails (code de connexion, confirmations) |
| `UPSTASH_REDIS_REST_*` | Redis, facultatif |

Aucun secret ne doit être versionné : les fichiers `.env` sont ignorés par Git. En production, l'API refuse de démarrer avec les valeurs d'exemple.

## Scripts

| Commande | Action |
|---|---|
| `npm run dev` | Site en développement (port 5100) |
| `npm run build` | Build de production du site |
| `npm run lint` | Analyse ESLint |
| `npm test` | Tests unitaires du site (Vitest) |
| `npm run test:backend` | Tests de l'API (dont intégration MongoDB si `MONGO_TEST_URI` est défini) |
| `npm run test:e2e` | Tests de bout en bout (Playwright) |
| `npm run dev --prefix backend` | API en développement |
| `npm run build --prefix backend` | Compilation de l'API |

## Tests et qualité

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
MONGO_TEST_URI=mongodb://127.0.0.1:27017 npm run test:backend
npx playwright install chromium && npm run build && npm run test:e2e
```

## Intégration continue et déploiement

Trois workflows GitHub Actions :

- **CI** (`ci.yml`) : lint, vérification des types, tests du site et de l'API (avec une base MongoDB jetable), builds, audit de sécurité.
- **E2E** (`e2e.yml`) : tests Playwright sur le site compilé.
- **Deploy** (`deploy.yml`) : après une CI réussie sur `main`, compile le site, le synchronise sur le serveur puis redémarre l'API (PM2). Le déploiement est ignoré, avec un avertissement, tant que les secrets de production ne sont pas tous configurés. Il peut aussi être lancé à la main.

La procédure complète (variables, nginx, ordre des opérations, vérifications et retour arrière) est dans [PRODUCTION.md](PRODUCTION.md).

## Sécurité

- Mots de passe hachés, jetons JWT à durée limitée, droits vérifiés côté serveur à chaque route.
- Validation des entrées, limitation de débit, en-têtes de sécurité (Helmet) et politique de sécurité du contenu en production.
- Prix recalculés côté serveur : le montant débité ne vient jamais du navigateur.
- Pour signaler une vulnérabilité, contactez directement les mainteneurs du dépôt plutôt que d'ouvrir une issue publique.

## Documentation

- [Mise en production](PRODUCTION.md)
- [Intégration du paiement SingPay](docs/singpay.md)
- [API : présentation et lancement](backend/README.md)
