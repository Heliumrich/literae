import { test, expect } from '@playwright/test';

const PERSON = '/personalites/gustave-dore';
const works = (page: import('@playwright/test').Page) => page.locator('section[aria-labelledby="created-title"]');
async function galleryCount(page: import('@playwright/test').Page) {
  const gallery = works(page).locator('script[data-lightbox-items]');
  return await gallery.count() ? JSON.parse((await gallery.textContent())!).length as number : 0;
}
test.beforeEach(async ({ context }) => {
  await context.route('https://api.literae.ch/**', route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"/>',
  }));
});

test('vingt œuvres par page, navigation et rechargement fonctionnent sans JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('https://api.literae.ch/**', route => route.abort());
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322' + PERSON);
  const count = await galleryCount(page);
  if (count <= 20) await context.close();
  test.skip(count <= 20, 'La collection pilote ne dépasse pas une page.');
  const section = works(page);
  await expect(section.locator('.artwork-card')).toHaveCount(20);
  const first = await section.locator('.catalog-card-copy').first().getAttribute('href');
  await section.getByRole('link', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${PERSON}/page/2#created-collection$`));
  await expect(section.locator('.artwork-card')).toHaveCount(Math.min(count - 20, 20));
  expect(await section.locator('.catalog-card-copy').first().getAttribute('href')).not.toBe(first);
  await page.evaluate(() => document.fonts.ready);
  const anchor = await page.locator('#created-collection').boundingBox();
  const header = await page.locator('.site-header').boundingBox();
  expect(anchor!.y).toBeGreaterThanOrEqual(header!.height);
  expect(anchor!.y).toBeLessThan(header!.height + 50);
  await expect(section.locator('.eyebrow')).toHaveText('Dans la collection');
  await page.reload();
  await expect(section.locator('[aria-current="page"]')).toHaveText('2');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://art.literae.ch' + PERSON + '/page/2');
  await context.close();
});

test('la lightbox traverse la limite entre deux pages de la collection', async ({ page }) => {
  await page.goto(PERSON);
  test.skip(await galleryCount(page) <= 20, 'La collection pilote ne dépasse pas une page.');
  await page.goto(PERSON + '/page/2');
  const section = works(page);
  const items = JSON.parse((await section.locator('script[data-lightbox-items]').textContent())!);
  await section.locator('[data-lightbox]').first().click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('alt', items[20].alt);
  await page.getByRole('button', { name: 'Œuvre précédente', exact: true }).click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('alt', items[19].alt);
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Œuvre suivante', exact: true }).click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('alt', items[20].alt);
});

test('dernière page et petites collections ont le bon nombre de cartes', async ({ page }) => {
  await page.goto(PERSON);
  const section = works(page);
  const count = await galleryCount(page);
  test.skip(!count, 'Aucune pyramide de Doré dans ce build.');
  const last = Math.ceil(count / 20);
  if (last > 1) await section.getByRole('link', { name: `Page ${last}`, exact: true }).click();
  await expect(section.locator('.artwork-card')).toHaveCount(count - (last - 1) * 20);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.goto('/personalites/paolo-veronese');
  await expect(page.locator('section[aria-labelledby="created-title"] .catalog-pager')).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="created-title"] .artwork-card').first()).toBeVisible();
});
