import { defineConfig } from 'vitest/config';

// Tests du backend : logique pure et routes avec modèles simulés, sans base de données.
// Lancer depuis la racine du projet : npm run test:backend
export default defineConfig({
  test: {
    environment: 'node',
    include: ['backend/tests/**/*.test.ts'],
  },
});
