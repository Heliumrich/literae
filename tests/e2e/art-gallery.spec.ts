import { test, expect, type Page } from '@playwright/test';
import { orderArtworks } from '../../src/lib/artworks';
import type { CatalogItem } from '../../src/lib/catalog-client';
import { PAGE_SIZE } from '../../src/lib/catalog';

const LOCAL = 'http://127.0.0.1:4322';
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect width="640" height="800" fill="#807151"/></svg>';
const SELECTION = [
  'fra-angelico-annonciation-prado',
  'the-vision-of-the-blessed-hermann-joseph',
  'veronese-noces-cana',
  'claude-vignon-saint-ambroise',
  'destruction-of-leviathan',
];

// Exercise URL choice and loading states without requesting originals from S3.
test.beforeEach(async ({ context }) => {
  await context.route('https://api.literae.ch/assets/**', route => route.fulfill({ contentType: 'image/svg+xml', body: IMAGE }));
});

const cardLinks = (page: Page) => page.locator('#catalog-grid .catalog-card-copy').evaluateAll(links => links.map(link => link.getAttribute('href')));
const quality = (page: Page) => page.getByRole('button', { name: 'Qualité originale', exact: true });

test('la qualité change dans la lightbox ouverte et reste mémorisée entre les œuvres et après F5', async ({ page, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  const first = items.find(item => item.original)!;
  const second = items.find(item => item.original && item.slug !== first.slug)!;
  await page.goto(first.href);
  const trigger = page.locator('[data-lightbox-mode="detail"]');
  await trigger.click();
  const viewer = page.locator('#lightbox');
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /\?key=/);

  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(first.original!, async route => {
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: IMAGE });
  });
  await quality(page).click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.lightbox-status')).toHaveText('Chargement de l’original…');
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', first.original!);
  release();
  await expect(viewer).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.lightbox-status')).toBeHidden();
  await page.keyboard.press('Escape');

  await page.goto(second.href);
  await page.locator('[data-lightbox-mode="detail"]').click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', second.original!);
  await page.reload();
  await page.locator('[data-lightbox-mode="detail"]').click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'true');
  await quality(page).click();
  await expect(viewer).toBeVisible();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /\?key=/);
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await page.goBack();
  await page.locator('[data-lightbox-mode="detail"]').click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'false');
});

test('la préférence suit la navigation dans les galeries et entre les deux domaines', async ({ page, context }) => {
  // Serve the built site under its real hostnames; all asset bytes remain mocked.
  await context.route(/^https:\/\/(art\.)?literae\.ch\//, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: LOCAL + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await page.goto('https://literae.ch/oeuvres');
  await expect(page.locator('#catalog-status')).toContainText('résultats');
  await page.locator('#catalog-grid [data-lightbox]').first().click();
  await quality(page).click();
  await page.getByRole('button', { name: 'Œuvre suivante', exact: true }).click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lightbox-img')).not.toHaveAttribute('src', /\?key=/);
  await page.keyboard.press('Escape');
  const href = await page.locator('#catalog-grid .catalog-card-copy').nth(2).getAttribute('href');
  await page.goto('https://art.literae.ch' + href);
  await page.locator('[data-lightbox-mode="detail"]').click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'true');
  await quality(page).click();
  await page.goto('https://literae.ch' + href);
  await page.locator('[data-lightbox-mode="detail"]').click();
  await expect(quality(page)).toHaveAttribute('aria-pressed', 'false');
});

test('les deux tris sont présents dans le HTML sans JavaScript et ont la même canonique', async ({ browser, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('https://api.literae.ch/**', route => route.abort());
  const page = await context.newPage();
  for (const [path, order] of [['/oeuvres', 'selection'], ['/oeuvres/selection', 'selection'], ['/oeuvres/nouveautes', 'nouveautes']] as const) {
    await page.goto(LOCAL + path);
    expect(await cardLinks(page)).toEqual(orderArtworks(items, order).slice(0, PAGE_SIZE).map(item => item.href));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://art.literae.ch/oeuvres');
  }
  const sitemap = await (await request.get('/sitemap-art.xml')).text();
  expect(sitemap).toContain('<loc>https://art.literae.ch/oeuvres</loc>');
  expect(sitemap).not.toMatch(/\/oeuvres\/(selection|nouveautes)</);
  await context.close();
});

test('recherche, étiquettes et combinaison sont conservées en changeant de tri et après F5', async ({ page, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  const candidate = items.find(item => item.tags.length && item.artist)!;
  const tag = candidate.tags[0];
  const query = candidate.artist!;
  const filtered = items.filter((item: any) => item.tags.includes(tag) && item.artist === query);
  const params = new URLSearchParams({ q: query, tags: tag, mode: 'or', p: '2' });
  await page.goto('/oeuvres/selection?' + params);
  await expect(page.locator('html')).not.toHaveAttribute('data-art-catalog-pending');
  await expect(page.locator('#catalog-search')).toHaveValue(query);
  for (const order of ['nouveautes', 'selection'] as const) {
    const link = page.locator(`[data-artwork-order="${order}"]`);
    const url = new URL((await link.getAttribute('href'))!, LOCAL);
    expect(url.searchParams.get('tags')).toBe(tag);
    expect(url.searchParams.get('q')).toBe(query);
    expect(url.searchParams.get('mode')).toBe('or');
    expect(url.searchParams.has('p')).toBe(false);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/oeuvres/${order}\\?`));
    await expect.poll(() => cardLinks(page)).toEqual(orderArtworks(filtered, order).slice(0, PAGE_SIZE).map(item => item.href));
    await page.reload();
    await expect.poll(() => cardLinks(page)).toEqual(orderArtworks(filtered, order).slice(0, PAGE_SIZE).map(item => item.href));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://art.literae.ch/oeuvres');
    await page.locator('#tag-toggle').click();
    await expect(page.locator('.tag-filter:checked')).toHaveValue(tag);
    await expect(page.locator('.mode-btn[data-mode="or"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  }
});

test('la barre de recherche, le tri et le filtre restent utilisables jusqu’à 320 px', async ({ page }) => {
  await page.goto('/oeuvres');
  for (const width of [1920, 1280, 844, 680, 601, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.catalog-toolbar').evaluate(root => {
      const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { search: rect('.catalog-search'), order: rect('.catalog-order'), filter: rect('#tag-toggle'), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.search.width).toBeGreaterThan(160);
    expect(layout.order.right).toBeLessThanOrEqual(layout.filter.left);
    if (width > 600) expect(Math.abs(layout.search.bottom - layout.order.bottom)).toBeLessThan(2);
    else expect(layout.search.bottom).toBeLessThan(layout.order.top);
    await expect(page.locator('#tag-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#tag-panel')).toBeHidden();
  }
  await page.locator('#tag-toggle').click();
  await expect(page.locator('#tag-panel')).toBeVisible();
});

test('les rangs manuels restent prioritaires après filtrage, indépendamment des dates', async ({ page, request }) => {
  const { items }: { items: CatalogItem[] } = await (await request.get('/oeuvres.json')).json();
  const fixtures = items.slice(0, 3).map((item, index) => ({
    ...item, sort: [2, 0, null][index], haystack: 'essai', tags: ['Essai'],
    date_created: `2026-11-0${index + 1}T10:00:00Z`,
  }));
  await page.route('**/oeuvres.json', route => route.fulfill({ json: { items: fixtures } }));
  await page.goto('/oeuvres/selection?q=essai&tags=Essai');
  await expect.poll(() => cardLinks(page)).toEqual([fixtures[1].href, fixtures[0].href, fixtures[2].href]);
  await page.locator('[data-artwork-order="nouveautes"]').click();
  await expect.poll(() => cardLinks(page)).toEqual([fixtures[2].href, fixtures[1].href, fixtures[0].href]);
  await page.locator('[data-artwork-order="selection"]').click();
  await expect.poll(() => cardLinks(page)).toEqual([fixtures[1].href, fixtures[0].href, fixtures[2].href]);
});

test('le seuil occupe le viewport et précède la sélection puis les derniers ajouts', async ({ page }) => {
  for (const [width, height] of [[1920, 1080], [1280, 800], [768, 1024], [390, 844], [320, 740], [844, 390], [667, 375], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/art');
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => ({
      bottom: document.querySelector('.art-hero')!.getBoundingClientRect().bottom,
      viewport: innerHeight,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sections: [...document.querySelectorAll('main > section')].map(section => section.className),
    }));
    expect(layout.overflow).toBe(false);
    expect(Math.abs(layout.bottom - layout.viewport), `${width} × ${height}: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(2);
    expect(layout.sections.slice(0, 3).map(name => name.split(' ')[0])).toEqual(['art-hero', 'art-preview', 'art-latest']);
    await expect(page.locator('.art-latest .editorial-link')).toHaveAttribute('href', '/oeuvres/nouveautes');
  }
});

test('les mêmes cinq œuvres sont sélectionnées sur les deux accueils', async ({ page }) => {
  for (const path of ['/', '/art']) {
    await page.goto(path);
    expect(await page.locator('.art-preview .art-card').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname.split('/').pop()))).toEqual(SELECTION);
    await expect(page.locator('.art-preview .editorial-link')).toHaveText('Voir notre sélection →');
    await expect(page.locator('.art-preview .editorial-link')).toHaveAttribute('href', 'https://art.literae.ch/oeuvres/selection');
  }
});
