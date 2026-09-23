import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
// Unique default port per product (derived from package name) so parallel product test runs never collide.
const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name as string;
const hash = [...pkgName].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const port = Number(process.env.E2E_PORT || 4400 + (hash % 500));
const base = '/' + (process.env.BASE || '').replace(/^[\/]+|[\/]+$/g, '');
const baseUrl = base === '/' ? '' : base;
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // Headless Chromium has no real camera, so the checker's getUserMedia() call rejects and the
    // "Use camera" test never sees a <video> element mount (Checker.tsx only flips cameraOn after
    // getUserMedia resolves). These two flags together give Chromium a synthetic video device and
    // auto-accept the permission prompt, matching what tool.spec.ts and STATUS.md already assumed
    // was configured here (P1-3 / audit-2). Without both flags together, one alone still blocks on
    // the permission prompt or finds no device.
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: {
    command: `npx astro preview --port ${port}`,
    url: `http://localhost:${port}${baseUrl}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
