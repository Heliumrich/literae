import { openOfflinePanel, closeOfflinePanel } from './comparator-helpers';
import { test, expect, devices, type Page } from '@playwright/test';

const PAGE = '/scriptorium/comparateur';

async function download(page: Page) {
  await page.goto(PAGE);
  await expect(page.locator('.verse p').first()).toContainText('Dieu');
  await openOfflinePanel(page);
  await page.getByRole('button', { name: 'Télécharger la Bible', exact: true }).click();
  await expect(page.locator('.offline-body [role="status"]')).toHaveText('La Bible et le lecteur sont disponibles hors ligne sur cet appareil.', { timeout: 60000 });
  await closeOfflinePanel(page);
}

async function readUnvisitedPassage(page: Page) {
  await page.locator('#cmp-ref').fill('Apocalypse 22:20-21');
  await page.getByRole('button', { name: 'Charger ce passage', exact: true }).click();
  await expect(page.locator('.translation-page').first().locator('.verse')).toHaveCount(2);
  await page.locator('#cmp-tr-0').selectOption('5');
  await expect(page.locator('.translation-code').first()).toContainText('VUL');
  await expect(page.locator('.verse p').first()).toContainText('Etiam');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.comparator-app-header')).toBeHidden();
}

for (const device of ['Desktop Chrome', 'Pixel 7']) {
  test.describe(`Navigateur classique : ${device}`, () => {
    const profile = devices[device];
    test.use({
      viewport: profile.viewport, userAgent: profile.userAgent,
      isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor,
    });

    test('change de livre et de traduction hors ligne après réouverture, sans installation', async ({ page, context }) => {
      await context.route('**/*', route => route.continue()); // Disable the HTTP cache.
      await download(page);
      await context.setOffline(true);
      await page.close();
      const reopened = await context.newPage();
      await reopened.goto(PAGE);
      await readUnvisitedPassage(reopened);
      await context.setOffline(false);
      const response = reopened.waitForResponse(response => response.url().includes('/api/bible/verses?') && response.status() === 200);
      await reopened.locator('#cmp-ref').fill('Genèse 2');
      await reopened.getByRole('button', { name: 'Charger ce passage', exact: true }).click();
      await response;
      await expect(reopened.locator('.translation-page').first().locator('.verse')).toHaveCount(25);
    });

    test('utilise la copie locale quand les requêtes échouent malgré navigator.onLine=true', async ({ page, context }) => {
      await download(page);
      await context.route('**/api/bible/verses?**', route => route.abort('internetdisconnected'));
      expect(await page.evaluate(() => navigator.onLine)).toBe(true);
      await readUnvisitedPassage(page);
    });

    test('retire le slash final hors ligne en conservant la référence demandée', async ({ page, context }) => {
      await download(page);
      await context.setOffline(true);
      await page.goto(PAGE + '/?ref=' + encodeURIComponent('Genèse 1'));
      expect(new URL(page.url()).pathname).toBe(PAGE);
      expect(new URL(page.url()).searchParams.get('ref')).toBe('Genèse 1');
      await expect(page.locator('.translation-page').first().locator('.verse')).toHaveCount(31);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  });
}
