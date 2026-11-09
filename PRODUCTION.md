# Mise en production — La Délicieuse Diète

Ce document décrit ce qu'il faut avoir en place AVANT le premier déploiement, comment déployer, et comment vérifier.

## 1. Ce qui est automatique

- Un push sur `main` lance la **CI** (lint, typage, tests front et backend avec une vraie MongoDB, builds).
- Le **déploiement** ne part que si la CI est terminée **avec succès** sur `main` (ou en lancement manuel).
- Il compile le front sur GitHub, le copie dans `dist/` sur le serveur, met à jour le backend, le recompile, le relance avec pm2
  et **vérifie `/health/live`** : si le serveur ne repart pas, le déploiement est en échec et les journaux s'affichent.

## 2. Variables d'environnement du backend (`backend/.env` sur le serveur)

| Variable | Obligatoire | Effet si absente ou fausse |
|---|---|---|
| `NODE_ENV=production` | oui | pas de vérification de configuration, CSP désactivée |
| `JWT_SECRET` | **oui, sinon le serveur refuse de démarrer** | 64 caractères aléatoires, jamais la valeur d'exemple |
| `MONGO_URI` | **oui, sinon le serveur refuse de démarrer** | |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | oui | sans mot de passe : aucune connexion admin ; valeur d'exemple (`CHANGE_ME…`, `admin123`) : refus de démarrer |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | oui | le code de connexion admin (OTP) ne peut pas être enregistré : connexion impossible |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD` | oui | aucun e-mail ne part (code de connexion, confirmations) |
| `FRONTEND_URL` | oui | `https://ladelicieuse.pivot40.tech` : liens de réinitialisation de mot de passe et origines autorisées |
| `SINGPAY_*` | oui pour les paiements | paiements désactivés |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | recommandé | notifications push désactivées |
| `ALLOW_UNQUOTED_ORDERS` | non (`false`) | voir §5 |

Au démarrage, le serveur journalise une alerte `[Config]` pour chaque dépendance manquante. Les relire après chaque déploiement.

## 3. nginx

Le front est servi par nginx depuis `dist/`, l'API et le temps réel sont relayés au backend (port 3000 par défaut).

```nginx
server {
    listen 443 ssl http2;
    server_name ladelicieuse.pivot40.tech;
    root /chemin/du/projet/dist;
    index index.html;

    # Fichiers à empreinte : cache d'un an
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # API et fichiers téléversés
    location ~ ^/(api|uploads)/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        # IMPORTANT : écraser l'en-tête, ne jamais le laisser venir du navigateur (limites de débit par IP)
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Temps réel (Socket.IO) : sans ces deux en-têtes, les pages retombent sur le rechargement périodique
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Si nginx ajoute sa propre politique de sécurité (CSP), elle doit autoriser `fonts.googleapis.com` (styles), `fonts.gstatic.com` (polices) et `wss:` (temps réel).

## 4. Une seule instance du backend

Le temps réel (Socket.IO) garde ses connexions en mémoire du processus. Garder **une seule instance** pm2 (mode `fork`, pas `cluster`),
sinon un événement émis par une instance n'atteint pas les navigateurs connectés à l'autre. Passer à plusieurs instances demandera un adaptateur
(Redis classique, pas Upstash REST).

## 5. Premier déploiement : ordre des opérations

1. **Sauvegarder la base** : `mongodump --uri "$MONGO_URI" --out sauvegarde-avant-deploiement`.
2. Vérifier `backend/.env` (§2) et `nginx` (§3).
3. **Migrations au démarrage** (idempotentes) : prix hebdomadaire des formules, tarif présentiel des consultations, calories des plats,
   **renommage des numéros de commande `CMD-0001` → `LDD-0001`** (seul le préfixe change). Les reçus déjà envoyés gardent l'ancien numéro.
   Retour arrière du renommage : `db.orders.updateMany({numero:/^LDD-/},[{$set:{numero:{$concat:["CMD-",{$substrCP:["$numero",4,{$strLenCP:"$numero"}]}]}}}])`.
4. **Fenêtre de mise en ligne** : pendant quelques minutes, un onglet resté ouvert sur l'ancien site envoie des commandes sans « devis » signé par le serveur ;
   elles sont refusées (« Votre panier doit être revalidé »). Le client n'a qu'à recharger la page.
   Si cela gêne, passer `ALLOW_UNQUOTED_ORDERS=true` le temps du déploiement, puis **repasser à `false` aussitôt** (les prix ne sont pas contrôlés tant que c'est `true`).
5. Lancer le déploiement (push sur `main` une fois la CI verte, ou lancement manuel).

## 5 bis. Préparation du serveur (une seule fois, par la personne qui administre le VPS)

À faire AVANT d'activer le déploiement automatique. Prérequis : Node.js 20 ou plus, npm, git, pm2, nginx, MongoDB accessible.

```bash
# 1. Cloner le dépôt dans le dossier du site (ce chemin devient le secret GitHub FOLDER)
sudo mkdir -p /var/www/ladelicieuse && sudo chown "$USER": /var/www/ladelicieuse
git clone https://github.com/INFRA-ESI/ladelicieuse.pivot40.tech.git /var/www/ladelicieuse

# 2. Configurer l'API (valeurs : §2)
cp /var/www/ladelicieuse/backend/.env.example /var/www/ladelicieuse/backend/.env
nano /var/www/ladelicieuse/backend/.env            # NODE_ENV=production, JWT_SECRET, MONGO_URI, ADMIN_*, FRONTEND_URL…

# 3. Compiler et lancer l'API, une seule instance (§4)
cd /var/www/ladelicieuse/backend && npm ci && npm run build && npm prune --omit=dev
pm2 start dist/server.js --name ladelicieuse-api && pm2 save && pm2 startup   # exécuter la commande affichée par pm2 startup

# 4. nginx : configuration du §3 (root = /var/www/ladelicieuse/dist), puis
sudo nginx -t && sudo systemctl reload nginx

# 5. Contrôle
curl -fsS http://127.0.0.1:3000/health/live && curl -fsS http://127.0.0.1:3000/health/ready
```

Le dossier du site doit être modifiable par l'utilisateur SSH du déploiement (secrets `USER`, `IP_SERVER`, `PORT`, `PRIVATE_KEY`, `PASSPHRASE_PRIVATE_KEY`).
Une fois le serveur prêt, dans GitHub : mettre à jour le secret `FOLDER` si le chemin diffère, puis créer la variable de dépôt `DEPLOY_AUTO` = `true`
(Settings > Secrets and variables > Actions > Variables). Un lancement manuel du workflow « Deploy » fonctionne sans cette variable.

## 6. Vérifications après déploiement

- `curl https://ladelicieuse.pivot40.tech/health/live` → 200 ; `/health/ready` → 200 (MongoDB et Redis répondent).
- Journaux pm2 : aucune alerte `[Config]` inattendue ; message « Serveur lancé ».
- Connexion à `/admin/login` : le code arrive par e-mail.
- Une commande de test en espèces : elle apparaît dans l'admin aussitôt (temps réel), numéro `LDD-…`, notification « Nouvelle commande ».
- Les polices de la marque s'affichent (Cormorant Garamond, Lato).

## 6 bis. Mesure Web Vitals (facultative)

Le site mesure le LCP, l'INP et le CLS chez les visiteurs (`src/lib/webVitals.ts`, chargé après l'affichage dans un fichier séparé).
**Sans configuration, rien ne quitte le navigateur** : l'événement `ld:web-vital` est émis localement, aucun envoi réseau.

Pour collecter les mesures, définir **avant `npm run build`** (variables du front, intégrées au build) :

- `VITE_VITALS_ENDPOINT` : adresse https d'un collecteur qui accepte un POST. Le corps est du JSON envoyé en `text/plain` (requête simple, pas de CORS à configurer).
  Le collecteur n'existe pas dans ce dépôt (aucune route API ajoutée) : service externe, ou route à créer après décision.
- `VITE_VITALS_SAMPLE` : part des visites mesurées, de 0 à 1 (1 par défaut).

Contenu d'un message : nom de la métrique, valeur, note, page normalisée (sans paramètres ni identifiants, `/suivi/:id`), type de connexion, palier de largeur d'écran.
Ni cookie, ni identifiant de visiteur, ni adresse IP stockée par le site. Les visiteurs qui envoient « Do Not Track » ou « Global Privacy Control » et l'administration ne sont pas mesurés.
La CSP actuelle (`connect-src 'self' https: wss:`) autorise un collecteur en https sans modification.

## 7. Retour arrière

- Front : relancer le déploiement du commit précédent (lancement manuel du workflow « Deploy » sur l'ancienne version).
- Backend : `git checkout <commit précédent>` dans le dossier du serveur, `cd backend && npm ci && npm run build && npm prune --omit=dev`, `pm2 restart ladelicieuse-api`.
- Base : restaurer `sauvegarde-avant-deploiement` seulement si une migration a mal tourné (`mongorestore`).

## 8. Points connus, à traiter après la mise en ligne

- **nodemailer** (avis de sécurité « high ») : la correction demande une montée de version majeure à tester avec un vrai envoi d'e-mail. Les failles visent des
  options de message et des listes d'autorisation de domaines que le code n'utilise pas.
- **zod** et **react-router** côté navigateur : avis sans effet ici (pas de rendu serveur, pas de données hostiles validées côté navigateur).
- Les polices viennent de Google Fonts : les héberger soi-même supprimerait une dépendance externe et accélérerait le premier affichage.
