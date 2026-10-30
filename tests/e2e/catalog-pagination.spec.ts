import { test, expect } from '@playwright/test';
import { PAGE_SIZE } from '../../src/lib/catalog';

const LIBRARY = '/scriptorium/bibliotheque';
const PAGE_TWO = `${LIBRARY}/page/2`;

test.beforeEach(async ({ context }) => {
  await context.route('https://api.literae.ch/**', route => route.abort());
});

async function catalogue(request: any) {
  return (await (await request.get(`${LIBRARY}.json`)).json()).items;
}

test('la page 2 est complète sans JavaScript, avec des liens et une canonique propres', async ({ browser, request }) => {
  const items = await catalogue(request);
  expect(items.length).toBeGreaterThan(PAGE_SIZE);
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('https://api.literae.ch/**', route => route.abort());
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4322${PAGE_TWO}`);
  await expect(page.locator('#catalog-grid .book-card > a').first()).toHaveAttribute('href', items[PAGE_SIZE].href);
  const links = await page.locator('#catalog-grid .book-card > a').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(links).toEqual(items.slice(PAGE_SIZE, PAGE_SIZE * 2).map((item: any) => item.href));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://literae.ch${PAGE_TWO}`);
  await page.getByRole('link', { name: 'Page 1', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4322${LIBRARY}`);
  await context.close();
});

test('navigation et F5 ne rendent jamais les livres de la page 1 sur la page 2', async ({ page, request }) => {
  const items = await catalogue(request);
  const firstPage = items.slice(0, PAGE_SIZE).map((item: any) => item.href);
  await page.addInitScript(() => {
    (window as any).catalogueSnapshots = [];
    new MutationObserver(() => {
      const links = [...document.querySelectorAll('#catalog-grid .book-card > a')].map(element => element.getAttribute('href'));
      if (links.length) (window as any).catalogueSnapshots.push(links);
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(LIBRARY);
  await page.getByRole('link', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${PAGE_TWO}$`));
  await page.reload();
  await expect(page.locator('#catalog-pager [aria-current="page"]')).toHaveText('2');
  const snapshots = await page.evaluate(() => (window as any).catalogueSnapshots as string[][]);
  expect(snapshots.length).toBeGreaterThan(0);
  expect(snapshots.flat().some(href => firstPage.includes(href))).toBe(false);
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(Math.min(PAGE_SIZE, items.length - PAGE_SIZE));
});

test('les anciens liens GET sont normalisés et les filtres ramènent à la première page', async ({ page }) => {
  await page.goto(`${LIBRARY}?p=2`);
  await expect(page).toHaveURL(new RegExp(`${PAGE_TWO}$`));
  await expect(page.locator('#catalog-pager [aria-current="page"]')).toHaveText('2');
  await page.locator('#catalog-search').fill('Confessions');
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?q=Confessions$`));
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://literae.ch${LIBRARY}`);
  await page.reload();
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(1);
  await expect(page.locator('#catalog-grid')).toBeVisible();
});

test('le tri reste appliqué pendant la pagination et après rechargement', async ({ page, request }) => {
  const items = await catalogue(request);
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  items.sort((a: any, b: any) => collator.compare(a.title, b.title));
  await page.goto(LIBRARY);
  await page.locator('#book-sort').selectOption('title');
  await page.getByRole('link', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${PAGE_TWO}\\?sort=title$`));
  await page.reload();
  await expect(page.locator('#book-sort')).toHaveValue('title');
  await expect(page.locator('html')).not.toHaveAttribute('data-book-catalog-pending');
  const hrefs = await page.locator('#catalog-grid .book-card > a').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(hrefs).toEqual(items.slice(PAGE_SIZE, PAGE_SIZE * 2).map((item: any) => item.href));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://literae.ch${PAGE_TWO}`);
});

for (const [path, origin] of [[LIBRARY, 'https://literae.ch'], [PAGE_TWO, 'https://literae.ch'], ['/oeuvres', 'https://art.literae.ch'], ['/personalites', 'https://art.literae.ch']]) {
  test(`canonique sans filtres dans le HTML de ${path}`, async ({ request }) => {
    for (const query of ['', '?tags=Saint&mode=or&q=test&sort=title&view=list&p=2']) {
      const response = await request.get(path + query);
      expect(response.ok()).toBe(true);
      const html = await response.text();
      const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/g)].map(match => match[1]);
      expect(canonicals).toEqual([origin + path]);
      expect(html).toContain(`<meta property="og:url" content="${origin + path}"`);
    }
  });
}

test('le sitemap référence la page 2 et aucune combinaison de filtres', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain(`<loc>https://literae.ch${PAGE_TWO}</loc>`);
  expect(xml).not.toMatch(/<loc>[^<]*\?/);
  const art = await (await request.get('/sitemap-art.xml')).text();
  expect(art).not.toMatch(/<loc>[^<]*\?/);
});
