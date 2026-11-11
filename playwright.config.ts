import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // In CI the build is pre-built; locally 'npm run dev' is used.
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:5100',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      // En CI, Chrome préinstallé sur le runner (voir .github/workflows/e2e.yml).
      use: { ...devices['Desktop Chrome'], ...(process.env.CI ? { channel: 'chrome' } : {}) },
    },
  ],
});
