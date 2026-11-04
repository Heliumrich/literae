import { test, expect, type Page } from '@playwright/test';

const svg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.25}"><rect width="100%" height="100%" fill="#876"/></svg>`;
test.beforeEach(async ({ context }) => {
  await context.route('https://api.literae.ch/assets/**', route => route.fulfill({
    contentType: 'image/svg+xml', body: svg(new URL(route.request().url()).searchParams.has('key') ? 800 : 2400),
  }));
});
const percent = async (page: Page) => Number((await page.locator('.lightbox-zoom-level').innerText()).replace(/\D/g, ''));
async function openCatalog(page: Page) {
  await page.goto('/oeuvres');
  await expect(page.locator('#catalog-status')).toContainText('résultats');
  await page.locator('#catalog-grid [data-lightbox]').first().click();
  await expect(page.locator('.lightbox-img')).toHaveJSProperty('naturalWidth', 800);
}
async function reachOriginal(page: Page) {
  for (let count = 0; count < 15; count++) {
    if (!(await page.locator('.lightbox-img').getAttribute('src'))!.includes('?key=')) break;
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
  }
  await expect(page.locator('.lightbox-img')).toHaveJSProperty('naturalWidth', 2400);
}

test('le zoom atteint la résolution optimisée, puis charge uniquement l’original courant et le conserve au dézoom', async ({ page }) => {
  await openCatalog(page);
  const reference = await page.locator('#catalog-grid [data-lightbox]').first().getAttribute('data-original-width');
  expect(Number(reference)).toBeGreaterThan(800);
  for (let count = 0; (await page.locator('.lightbox-img').boundingBox())!.width < 799 && count < 15; count++) {
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await page.waitForTimeout(30);
  }
  expect(await percent(page)).toBe(Math.round(800 / Number(reference) * 100));
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /\?key=/);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.literae.ch/assets/**', async route => {
    if (new URL(route.request().url()).searchParams.has('key')) return route.fallback();
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg(2400) });
  });
  const beforeUpgrade = (await page.locator('.lightbox-img').boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(page.locator('#lightbox')).toHaveAttribute('aria-busy', 'true');
  const status = (await page.locator('.lightbox-status').boundingBox())!;
  const toolbar = (await page.locator('.lightbox-top').boundingBox())!;
  expect(status.y).toBeLessThan(toolbar.y + toolbar.height + 10);
  release();
  await expect(page.locator('.lightbox-img')).toHaveJSProperty('naturalWidth', 2400);
  await expect.poll(async () => (await page.locator('.lightbox-img').boundingBox())!.width).toBeGreaterThan(beforeUpgrade);
  const rendered = (await page.locator('.lightbox-img').boundingBox())!.width;
  expect(await percent(page)).toBe(Math.round(rendered / Number(reference) * 100));
  const original = await page.locator('.lightbox-img').getAttribute('src');
  for (let count = 0; count < 6; count++) await page.getByRole('button', { name: 'Dézoomer', exact: true }).click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', original!);
  await expect(page.locator('.lightbox-quality')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('literae-lightbox-quality'))).toBeNull();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('#catalog-grid [data-lightbox]').first().click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', original!);
  await page.getByRole('button', { name: 'Œuvre suivante', exact: true }).click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /\?key=/);
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.locator('#lightbox')).toBeHidden();
});

test('la molette zoome, le glissement déplace l’image sans fermer la visionneuse', async ({ page, browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false });
  await context.route('https://api.literae.ch/assets/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg(new URL(route.request().url()).searchParams.has('key') ? 800 : 2400) }));
  const desktop = await context.newPage();
  await openCatalog(desktop);
  await desktop.mouse.move(640, 400);
  const before = await percent(desktop);
  await desktop.mouse.wheel(0, -100);
  await expect.poll(() => percent(desktop)).toBeGreaterThan(before);
  for (let i = 0; i < 5; i++) await desktop.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await desktop.waitForTimeout(50);
  const old = await desktop.locator('.lightbox-img').boundingBox();
  await desktop.mouse.move(640, 400); await desktop.mouse.down();
  await desktop.mouse.move(700, 430, { steps: 8 }); await desktop.mouse.up();
  await expect(desktop.locator('#lightbox')).toBeVisible();
  const moved = await desktop.locator('.lightbox-img').boundingBox();
  expect(moved!.x).toBeGreaterThan(old!.x);
  await context.close();
});

test('le pincement tactile zoome sans modifier la préférence de qualité', async ({ page, context }) => {
  await openCatalog(page);
  const stage = (await page.locator('.lightbox-stage').boundingBox())!;
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
  const client = await context.newCDPSession(page);
  const before = (await page.locator('.lightbox-img').boundingBox())!.width;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (const distance of [40, 50, 70, 90]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - distance, y: cy, id: 1 }, { x: cx + distance, y: cy, id: 2 }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await page.locator('.lightbox-img').boundingBox())!.width).toBeGreaterThan(before);
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('.lightbox-quality')).toHaveAttribute('aria-pressed', 'false');
});

test('la fiche garde toute la surface et la sélection fonctionne sur les deux accueils', async ({ page, request }) => {
  const { items } = await (await request.get('/oeuvres.json')).json();
  await page.goto(items[0].href);
  await page.locator('[data-lightbox-mode="detail"]').click();
  await reachOriginal(page);
  const layout = await page.locator('.lightbox-stage').evaluate(el => ({ height: el.clientHeight, viewport: document.documentElement.clientHeight }));
  expect(layout.height).toBe(layout.viewport);
  await expect(page.locator('.lightbox-cap')).toBeHidden();
  for (const path of ['/', '/art']) {
    await page.goto(path);
    await page.locator('.art-preview [data-lightbox]').first().click();
    await expect(page.locator('.lightbox-img')).toHaveJSProperty('naturalWidth', 800);
    await reachOriginal(page);
    await expect(page.locator('.lightbox-quality')).toHaveAttribute('aria-pressed', 'false');
    const footer = (await page.locator('.lightbox-cap').boundingBox())!;
    expect(footer.height).toBeLessThan(65);
  }
});

test('les collections d’un artiste utilisent le même zoom temporaire', async ({ page }) => {
  await page.goto('/personalites/gustave-dore');
  await page.locator('[data-lightbox]').first().click();
  await expect(page.locator('.lightbox-img')).toHaveJSProperty('naturalWidth', 800);
  await reachOriginal(page);
  await page.getByRole('button', { name: 'Œuvre suivante', exact: true }).click();
  await expect(page.locator('.lightbox-img')).toHaveAttribute('src', /\?key=/);
  await expect(page.locator('.lightbox-quality')).toHaveAttribute('aria-pressed', 'false');
});
