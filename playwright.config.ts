import { defineConfig, devices } from '@playwright/test';

// Runs against the production build of the web app (`npm run build` first).
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -w @uniplan/web -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'web', testMatch: 'web.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testMatch: /(phone|capacitor)\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testMatch: 'desktop.spec.ts' },
  ],
});
