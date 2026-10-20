import { resolve } from 'node:path';

import { defineConfig } from '@playwright/test';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const databasePath = resolve(workspaceRoot, 'output/playwright/person-b-phase-9.sqlite');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  outputDir: '../../output/playwright/simulator-results',
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --conditions=development --import tsx apps/simulator/e2e/start-backend.ts',
      cwd: workspaceRoot,
      env: {
        DATABASE_PATH: databasePath,
        HTTP_HOST: '127.0.0.1',
        PORT: '3000',
        STORY_EXTRACTION_PROVIDER: 'disabled',
        CHAPTER_GENERATION_PROVIDER: 'disabled',
      },
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'corepack pnpm --filter @story-keeper/simulator dev',
      cwd: workspaceRoot,
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'corepack pnpm --filter @story-keeper/timeline dev',
      cwd: workspaceRoot,
      url: 'http://localhost:4174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
