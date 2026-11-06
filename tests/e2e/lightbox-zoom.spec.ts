import { test, expect, type Page } from '@playwright/test';
import type { CatalogItem } from '../../src/lib/catalog-client';

const media = process.env.ART_MEDIA_TEST_PROXY;
const descriptor = '<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" TileSize="512" Overlap="1" Format="webp"><Size Width="6144" Height="8192"/></Image>';
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="514" height="514"><rect width="100%" height="100%" fill="#876"/><path d="M0 0L514 514" stroke="black"/></svg>';

test.beforeEach(async ({ context }) => {
  await context.route('**/art-media/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (media) return route.fulfill({ response: await route.fetch({ url: new URL(path, media).href }) });
    if (path.endsWith('.dzi')) return route.fulfill({ contentType: 'application/xml', body: descriptor });
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
});

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

const zoom = (page: Page) => page.getByRole('button', { name: 'Zoomer', exact: true });
const level = async (page: Page) => parseInt(await page.locator('.lightbox-zoom-level').innerText(), 10);
async function ready(page: Page) {
  await expect(page.locator('#lightbox')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.lightbox-viewer')).toHaveCSS('opacity', '1');
}

test('la fiche demande les niveaux de tuiles à la demande et conserve sa surface', async ({ page, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  const item = items.find(item => item.slug === 'adoration-of-the-magi-1624') ?? items[0];
  expect(item?.dzi).toMatch(/^\/art-media\//);
  const tiles: string[] = [];
  const directus: string[] = [];
  page.on('request', req => {
    if (req.url().includes('/image_files/')) tiles.push(req.url());
    if (req.url().includes('api.literae.ch/assets/')) directus.push(req.url());
  });
  await page.goto(item.href);
  await expect(page.locator('.lightbox-viewer')).toHaveCount(0);
  expect(tiles).toHaveLength(0);
  const trigger = page.locator('[data-lightbox-mode="detail"]');
  await trigger.click();
  await ready(page);
  await expect(page.locator('.lightbox-viewer canvas').first()).toBeVisible();
  const before = await level(page);
  const maxTile = () => Math.max(...tiles.map(url => Number(url.match(/image_files\/(\d+)\//)?.[1])));
  const initialLevel = maxTile();
  for (let count = 0; count < 6; count++) await zoom(page).click();
  await expect.poll(() => level(page)).toBeGreaterThan(before);
  await expect.poll(maxTile).toBeGreaterThan(initialLevel);
  expect(tiles.length).toBeLessThan(150);
  expect(directus).toHaveLength(0);
  await expect(page.locator('.lightbox-cap')).toBeHidden();
  await expect(page.locator('.lightbox-stage')).toHaveCSS('height', await page.evaluate(() => innerHeight + 'px'));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.lightbox-viewer canvas')).toHaveCount(0);
});

test('la galerie précharge l’aperçu suivant et peut changer d’œuvre', async ({ page, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  expect(items.length).toBeGreaterThan(1);
  const requested: string[] = [];
  page.on('request', req => requested.push(new URL(req.url()).pathname));
  await page.goto('/oeuvres');
  await expect(page.locator('#catalog-status')).toContainText('résultats');
  await page.locator('#catalog-grid [data-lightbox]').first().click();
  await ready(page);
  await expect.poll(() => requested.includes(items[1].preview!)).toBe(true);
  expect(requested).not.toContain(items[1].dzi);
  await page.getByRole('button', { name: 'Œuvre suivante' }).click();
  await ready(page);
  await expect(page.locator('.lightbox-cap-link')).toHaveText(items[1].title);
  expect(requested).toContain(items[1].dzi);
  await expect(page.getByRole('link', { name: 'Télécharger avec Dezoomify' })).toHaveAttribute('href', /dezoomify/);
});

test('le pincement tactile et Épique fonctionnent depuis la collection de Doré', async ({ page, context }) => {
  await page.goto('/personalites/gustave-dore');
  const trigger = page.locator('[data-lightbox]').first();
  await trigger.click();
  await ready(page);
  const stage = page.locator('.lightbox-stage');
  await page.getByRole('button', { name: 'Épique' }).click();
  await expect(stage).toHaveClass(/is-epic/);
  const bounds = (await stage.boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  const client = await context.newCDPSession(page);
  const before = await level(page);
  const fingers = (distance: number) => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(35) });
  for (const distance of [45, 60, 80, 100]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(distance) });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => level(page)).toBeGreaterThan(before);
});
