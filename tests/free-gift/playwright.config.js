const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  workers: 1,
  outputDir: process.env.RUN_STOREFRONT_TESTS === '1' ? 'test-results/storefront' : 'test-results/local',
  maxFailures: process.env.RUN_STOREFRONT_TESTS === '1' ? 1 : 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
});
