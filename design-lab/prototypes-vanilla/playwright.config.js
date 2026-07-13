import { defineConfig, devices } from '@playwright/test';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { defaultBrowserType: _iphone13Browser, ...iphone13 } = devices['iPhone 13'];
const { defaultBrowserType: _iphone14Browser, ...iphone14ProMax } = devices['iPhone 14 Pro Max'];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    launchOptions: { executablePath: chrome },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile-390', use: { ...iphone13, viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430', use: { ...iphone14ProMax, viewport: { width: 430, height: 932 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: false } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, isMobile: false } },
    { name: 'reduced-motion', use: { ...iphone13, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' } },
  ],
});
