import { defineConfig, devices } from '@playwright/test';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { defaultBrowserType: _browser, ...iphone14ProMax } = devices['iPhone 14 Pro Max'];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'google-cloud-demo.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    ...iphone14ProMax,
    baseURL: process.env.GOOGLE_CLOUD_DEMO_URL || 'http://127.0.0.1:4174',
    launchOptions: { executablePath: chrome },
    viewport: { width: 430, height: 932 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
