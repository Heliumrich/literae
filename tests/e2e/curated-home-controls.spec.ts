import { test, expect } from '@playwright/test';
import { openOfflinePanel, closeOfflinePanel } from './comparator-helpers';

test.use({ ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });

test('la bibliothèque respecte Directus puis garde le tri explicite après rechargement', async ({ page, request }) => {
  const params = new URLSearchParams({ fields: 'id,title,sort', 'filter[archived][_eq]': 'false', sort: 'sort,title,id', limit: '100' });
  const cms = await request.get('https://api.literae.ch/items/books?' + params);
  expect(cms.ok()).toBe(true);
  const order = (await cms.json()).data.map((book: { id: string }) => book.id);
  const { items } = await (await request.get('/scriptorium/bibliotheque.json')).json();
  expect(items.map((book: { id: string }) => book.id)).toEqual(order);
  await page.goto('/scriptorium/bibliotheque');
  await expect(page.locator('#book-sort')).toHaveValue('default');
  const links = () => page.locator('#catalog-grid .book-card > a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  await expect.poll(links).toEqual(items.slice(0, 40).map((book: { href: string }) => book.href));
  await page.locator('#book-sort').selectOption('title');
  await expect(page).toHaveURL(/sort=title/);
  await page.reload();
  await expect(page.locator('#book-sort')).toHaveValue('title');
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  const alphabetical = [...items].sort((a, b) => collator.compare(a.title, b.title));
  await expect.poll(() => page.locator('#catalog-grid h2').allTextContents()).toEqual(alphabetical.slice(0, 40).map(book => book.title));
  await page.locator('#book-sort').selectOption('default');
  await expect.poll(links).toEqual(items.slice(0, 40).map((book: { href: string }) => book.href));
  expect(new URL(page.url()).searchParams.has('sort')).toBe(false);
});

test('la disquette reste dans les contrôles sans ajouter de ligne sur mobile', async ({ page }) => {
  await page.goto('/scriptorium/comparateur');
  const button = page.getByRole('button', { name: 'Emporter le comparateur', exact: true });
  await expect(button).toBeVisible();
  for (const width of [320, 360, 390, 680, 844, 1280, 1920]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
    const layout = await page.locator('.controls-top').evaluate(root => {
      const rect = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
      const icon = rect('.offline-button'), input = rect('.reference-input');
      const rows = new Set([...root.children].filter(el => el.getBoundingClientRect().height).map(el => Math.round(el.getBoundingClientRect().bottom)));
      return { icon: icon.toJSON(), input: input.toJSON(), rows: rows.size,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.icon.width).toBeGreaterThanOrEqual(44);
    expect(layout.icon.height).toBeGreaterThanOrEqual(44);
    expect(layout.overflow).toBe(false);
    if (width <= 680) {
      expect(Math.abs(layout.icon.bottom - layout.input.bottom)).toBeLessThanOrEqual(1);
      expect(layout.icon.left).toBeGreaterThanOrEqual(layout.input.right);
      expect(layout.rows).toBeLessThanOrEqual(width === 320 ? 3 : 2);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await page.locator('.comparator-controls').boundingBox();
  await openOfflinePanel(page);
  await expect(page.locator('.setup-steps > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Télécharger la Bible', exact: true })).toBeVisible();
  await expect(page.locator('.comparator-controls')).toHaveJSProperty('offsetHeight', Math.round(before!.height));
  await page.keyboard.press('Escape');
  await expect(page.locator('#comparator-offline-dialog')).toBeHidden();
  await expect(button).toBeFocused();
  await openOfflinePanel(page);
  await closeOfflinePanel(page);
});
