import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: [
    { command: 'node scripts/e2e-api.mjs', url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: false, timeout: 60000 },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
