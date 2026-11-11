import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import type { ClientRequest, IncomingMessage } from "node:http";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// En production (conteneur Docker), l'API est dans un autre conteneur : API_TARGET donne son adresse (voir docker-compose.yml).
const previewApiTarget = process.env.API_TARGET ?? 'http://localhost:3000';

// changeOrigin remplace l'en-tête Host par celui de l'API : sans x-forwarded-host, l'API ne peut plus reconnaître
// qu'une requête du navigateur vient du site lui-même (règle « même origine » du CORS) et la refuse.
const forwardHost: ProxyOptions['configure'] = proxy => {
  const set = (proxied: ClientRequest, req: IncomingMessage) => {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (typeof host === 'string' && host) proxied.setHeader('x-forwarded-host', host);
  };
  proxy.on('proxyReq', set);
  proxy.on('proxyReqWs', set);
};

// Les fichiers de /assets portent un hash dans leur nom : leur contenu ne change jamais sous un même nom. Par défaut le serveur de
// production (vite preview) les envoie en « no-cache » : le navigateur les revérifie un par un à chaque visite, ce qui coûte un
// aller-retour réseau par fichier sur une connexion lente. On les fait garder un an. Une adresse /assets/ inconnue reçoit la page
// d'accueil en repli : celle-là ne doit jamais être gardée.
const immutableAssets = (): Plugin => ({
  name: 'immutable-assets',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/assets/')) {
        const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
        // Le serveur de fichiers passe ses en-têtes directement à writeHead : ils l'emportent sur setHeader, il faut donc les modifier là.
        res.writeHead = ((status: number, ...rest: unknown[]) => {
          const headers = rest.find(arg => arg && typeof arg === 'object' && !Array.isArray(arg)) as Record<string, unknown> | undefined;
          const names = headers ? Object.keys(headers) : [];
          const type = String(headers?.[names.find(n => n.toLowerCase() === 'content-type') ?? ''] ?? res.getHeader('Content-Type') ?? '');
          if (!type.includes('text/html')) {
            for (const name of names) if (name.toLowerCase() === 'cache-control') delete headers![name];
            if (headers) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
            else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
          return writeHead(status, ...rest);
        }) as typeof res.writeHead;
      }
      next();
    });
  },
});

export default defineConfig(() => ({
  server: {
    host: "0.0.0.0",
    port: 5100,
    allowedHosts: [
      "ladelicieuse.pivot40.tech",
      "ladelicieuse.singcloud.ga",
      "localhost",
      "127.0.0.1"
    ],
    hmr: {
      overlay: false,
    },
    // Proxy vers le backend pour les requêtes API (DEV_API_TARGET si le port 3000 est pris par autre chose)
    proxy: {
      '/api': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
      '/uploads': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      // Temps réel (Socket.IO) : le proxy doit laisser passer la mise à niveau WebSocket.
      '/socket.io': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        // Backend arrêté ou redémarré pendant qu'une WebSocket est relayée : sans ce gestionnaire, l'erreur de
        // connexion n'est pas interceptée et fait tomber tout le serveur de développement.
        configure: proxy => { proxy.on('error', () => undefined); },
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5100,
    allowedHosts: [
      "ladelicieuse.pivot40.tech",
      "ladelicieuse.singcloud.ga",
      "localhost",
      "127.0.0.1"
    ],
    proxy: {
      '/api': {
        target: previewApiTarget,
        changeOrigin: true,
        configure: forwardHost,
      },
      '/uploads': {
        target: previewApiTarget,
        changeOrigin: true,
        configure: forwardHost,
      },
      '/socket.io': {
        target: previewApiTarget,
        changeOrigin: true,
        configure: forwardHost,
        ws: true,
      },
    },
  },
  plugins: [react(), immutableAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    assetsInlineLimit: 4096,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core':   ['react', 'react-dom', 'react-router-dom'],
          'ui-radix':     ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-popover', '@radix-ui/react-accordion'],
          'ui-animation': ['framer-motion'],
          // recharts n'est volontairement PAS listé ici. Une entrée `'charts': ['recharts']` embarque aussi les
          // dépendances de recharts, dont `clsx` (utilisé par `cn()` dans tout le site) : le fichier d'entrée en dépendait
          // alors et chaque visiteur téléchargeait ~112 Ko de graphiques. Sans entrée, Rollup range recharts avec les
          // pages qui l'utilisent (tableau de bord, rapports, factures, promotions, suivi) et il se charge à la demande.
          'forms':        ['react-hook-form', '@hookform/resolvers', 'zod'],
          'date':         ['date-fns'],
        },
      },
    },
  },
}));
