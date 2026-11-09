import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
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
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [react()],
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
