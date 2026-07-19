import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'recording-visual.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'artifacts/recording-visual/test-results',
  use: {
    baseURL: process.env.COMPETITION_DEMO_URL || 'http://127.0.0.1:4174',
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
  },
});
