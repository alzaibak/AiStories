import { defineConfig } from '@playwright/test';

// QA harness config. Two projects because the public site and the admin portal
// are two Vite apps on two ports. Chrome is used via channel so no extra
// browser download is needed on this machine.
export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/report.json' }],
    ['html', { outputFolder: 'artifacts/html', open: 'never' }]
  ],
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000
  },
  projects: [
    {
      name: 'public',
      testMatch: /(setup|public|auth|reader|mobile|discovery|crosscheck)\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:5173' }
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:5174' }
    }
  ]
});
