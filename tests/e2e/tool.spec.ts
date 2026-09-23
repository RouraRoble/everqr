import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = ('/' + (process.env.BASE || '').replace(/^[\/]+|[\/]+$/g, '')).replace(/\/$/, '');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-qr.png');

test.describe('Generator: primary flow', () => {
  test('generate a Wi-Fi QR code and enable export', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.getByRole('tab', { name: 'Wi-Fi' }).click();
    await page.getByLabel('Network name (SSID)').fill('Home-Network');
    await page.getByLabel('Password').fill('correct-horse-battery');

    const preview = page.getByRole('img', { name: 'Generated QR code preview' });
    await expect(preview).toBeVisible();

    const downloadSvg = page.getByRole('button', { name: 'Download SVG' });
    await expect(downloadSvg).toBeEnabled();
    const downloadPng = page.getByRole('button', { name: 'Download PNG' });
    await expect(downloadPng).toBeEnabled();
  });

  test('private field values (e.g. a Wi-Fi password) are not persisted to localStorage (P2-14)', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.getByRole('tab', { name: 'Wi-Fi' }).click();
    await page.getByLabel('Network name (SSID)').fill('Cafe-Net');
    await page.getByLabel('Password').fill('super-secret-password');
    await expect(page.getByRole('img', { name: 'Generated QR code preview' })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('everqr:last'));
    expect(stored).not.toContain('super-secret-password');
    expect(stored).not.toContain('Cafe-Net');
    // The design itself is still remembered.
    const parsed = JSON.parse(stored ?? '{}');
    expect(parsed.type).toBe('wifi');
    expect(parsed.design).toBeTruthy();
  });

  test('a corrupt/stale localStorage entry does not crash the generator (P2-15)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '/');
    await page.evaluate(() => localStorage.setItem('everqr:last', JSON.stringify({ type: 'bogus-future-type' })));
    await page.reload();
    // Falls back to the default ("url") content type instead of crashing the island.
    await expect(page.getByRole('tab', { name: 'URL', selected: true })).toBeVisible();
    await page.getByLabel('Web address').fill('example.com');
    await expect(page.getByRole('img', { name: 'Generated QR code preview' })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('shows a validation message and no preview for incomplete input', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.getByRole('tab', { name: 'Wi-Fi' }).click();
    await expect(page.getByRole('img', { name: 'Generated QR code preview' })).toHaveCount(0);
    await expect(page.locator('.gen__empty')).toBeVisible();
  });

  test('the foreground hex field can be typed into character by character (P2-7)', async ({ page }) => {
    await page.goto(BASE + '/');
    const hex = page.getByLabel('Foreground hex');
    await hex.click();
    await hex.press('ControlOrMeta+a');
    await hex.pressSequentially('#ff0000', { delay: 30 });
    await expect(hex).toHaveValue('#ff0000');
    // Blurring a valid value keeps it (does not revert to the previous colour).
    await page.keyboard.press('Tab');
    await expect(hex).toHaveValue('#ff0000');
  });

  test('the hex field stays in sync after typing a value that normalises to the current colour (audit-2 N-3)', async ({ page }) => {
    await page.goto(BASE + '/');
    const hex = page.getByLabel('Foreground hex');
    const picker = page.getByLabel('Foreground', { exact: true });
    await hex.click();
    await hex.press('ControlOrMeta+a');
    // Set fg to #ff0000, then type the 3-digit shorthand "#f00" which normalises to the SAME
    // colour already in `design` — the design.fg value never changes, so a naive "skip the next
    // sync" flag armed on every valid keystroke never gets consumed and wrongly swallows the
    // following external change.
    await hex.pressSequentially('#ff0000', { delay: 20 });
    await hex.press('ControlOrMeta+a');
    await hex.pressSequentially('#f00', { delay: 20 });
    await page.keyboard.press('Tab');
    // Now change the colour via the native picker (an external change to `design.fg`) and confirm
    // the hex field actually follows it instead of staying stuck on the old value.
    await picker.fill('#0000ff');
    await expect(hex).toHaveValue('#0000ff');
  });

  test('a copied design link reproduces the design when reopened', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.getByRole('tab', { name: 'Text' }).click();
    await page.getByLabel('Text').fill('hello from a share link');
    await expect(page.getByRole('img', { name: 'Generated QR code preview' })).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('checkbox', { name: /Include content in the link/ }).check();
    await page.getByRole('button', { name: 'Copy link to this design' }).click();
    await expect(page.getByText('Link copied')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#d=');

    const hash = new URL(link).hash;
    await page.goto(BASE + '/' + hash);
    await expect(page.getByRole('img', { name: 'Generated QR code preview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Text', selected: true })).toBeVisible();
    await expect(page.getByLabel('Text')).toHaveValue('hello from a share link');
  });
});

test.describe('Bulk generator', () => {
  test('pasted rows render a preview grid and enable the ZIP download', async ({ page }) => {
    await page.goto(BASE + '/bulk/');
    await page.getByLabel(/Or paste one item per line/).fill('https://example.com/1,Table 1\nhttps://example.com/2,Table 2');
    await expect(page.locator('.bulk__cell')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeEnabled();
  });
});

test.describe('Checker', () => {
  test('classifies an uploaded fixture QR image as a direct link', async ({ page }) => {
    await page.goto(BASE + '/check/');
    await page.setInputFiles('#check-file', FIXTURE);
    await expect(page.locator('.check__verdict')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.check__payload')).toHaveText('https://example.com/fixture');
    await expect(page.locator('.check__verdict')).toHaveClass(/check__verdict--direct/);
  });

  test('"Use camera" actually attaches and plays the stream', async ({ page }) => {
    // Playwright launches Chromium with --use-fake-device-for-media-stream (see playwright.config.ts),
    // which synthesises a moving test pattern. It is not a scannable QR code, so this test asserts
    // the <video> element is actually receiving and playing frames (regression for the bug where
    // srcObject was assigned before the <video> mounted, so the preview stayed blank forever).
    await page.goto(BASE + '/check/');
    await page.getByRole('button', { name: 'Use camera' }).click();
    const video = page.locator('.check__camera video');
    await expect(video).toBeVisible();
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState), { timeout: 10000 })
      .toBeGreaterThanOrEqual(2); // HAVE_CURRENT_DATA or better: a frame has actually decoded
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.videoWidth), { timeout: 10000 })
      .toBeGreaterThan(0);
    await expect(video.evaluate((el: HTMLVideoElement) => el.paused)).resolves.toBe(false);
  });
});

test.describe('Programmatic use-case pages', () => {
  test('a use-case page preselects its content type', async ({ page }) => {
    await page.goto(BASE + '/qr-code-for/wifi/');
    await expect(page.getByRole('tab', { name: 'Wi-Fi', selected: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wi-Fi');
  });
});
