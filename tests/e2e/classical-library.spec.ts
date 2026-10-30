import {
  test,
  expect,
  devices,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import originalBatch from '../../scripts/catalogs/library-2026-10.json' with { type: 'json' };
import bloyBourget from '../../scripts/catalogs/bloy-bourget-2026-10.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';
const batch = [...originalBatch, ...bloyBourget];
const MAIN = 'https://literae.ch',
  LOCAL = 'http://127.0.0.1:4322';
test.use({
  baseURL: MAIN,
  ...(process.env.HTTPS_PROXY
    ? {
        proxy: {
          server: process.env.HTTPS_PROXY,
          bypass: '127.0.0.1,localhost',
        },
      }
    : {}),
});
test.beforeEach(async ({ context }) => {
  await context.route(MAIN + '/**', async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: LOCAL + u.pathname + u.search }),
    });
  });
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});
const profiles = [
  {
    name: '1920 × 1080',
    userAgent: devices['Desktop Chrome'].userAgent,
    viewport: { width: 1920, height: 1080 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
  { name: 'Pixel portrait', ...devices['Pixel 7'] },
  { name: 'Pixel paysage', ...devices['Pixel 7 landscape'] },
];
async function openBook(page: Page, request: APIRequestContext, title: string) {
  const items = (
    await (await request.get(LOCAL + '/scriptorium/bibliotheque.json')).json()
  ).items;
  const item = items.find((b: { title: string }) => b.title === title);
  expect(item).toBeTruthy();
  await page.goto(item.href);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  return item;
}
for (const profile of profiles)
  test.describe('Classiques : ' + profile.name, () => {
    test.use({
      userAgent: profile.userAgent,
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    for (const row of batch)
      test(row.title, async ({ page, request }, info) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await openBook(page, request, row.title);
        const cover = await page
          .locator('[data-reader="viewport"]')
          .evaluate((viewport) => {
            const frame = [...viewport.querySelectorAll('iframe')].find((f) =>
              f.contentDocument?.querySelector('.literae-cover'),
            );
            if (!frame) return null;
            const doc = frame.contentDocument!,
              svg = doc.querySelector('svg')!,
              bounds = svg.getBoundingClientRect();
            const cropped = [...svg.querySelectorAll('text')].some((n) => {
              const b = n.getBoundingClientRect();
              return (
                b.left < bounds.left - 1 ||
                b.right > bounds.right + 1 ||
                b.top < bounds.top - 1 ||
                b.bottom > bounds.bottom + 1
              );
            });
            return {
              height: doc.body.getBoundingClientRect().height,
              expected: viewport.clientHeight,
              cropped,
            };
          });
        expect(cover).toBeTruthy();
        expect(cover!.height).toBe(cover!.expected);
        expect(cover!.cropped).toBe(false);
        if (row.key === 'colonnes')
          await page.locator('[data-reader="viewport"]').screenshot({
            path: info.outputPath('cover.png'),
          });
        const href = await page
          .locator('[data-reader="toc-link"]')
          .evaluateAll((links) =>
            links
              .map((a) => (a as HTMLElement).dataset.href!)
              .find((h) => h.startsWith('section-')),
          );
        expect(href).toBeTruthy();
        await chooseChapterHref(page, href!);
        const path = href!.split('#')[0];
        await page.locator('.reader-settings summary').click();
        await page.locator('[data-reader="font"]').selectOption('lora');
        await page.locator('[data-reader="size"]').fill('24');
        await page.locator('[data-reader="justify"]').check();
        await page.locator('[data-reader="hyphenate"]').uncheck();
        await page.locator('[data-reader="palette"]').selectOption('oled');
        await expect
          .poll(() =>
            page
              .locator('[data-reader="viewport"]')
              .evaluate((viewport, path) => {
                for (const frame of viewport.querySelectorAll('iframe')) {
                  const doc = frame.contentDocument;
                  if (
                    !doc?.documentElement?.dataset.readerSource?.endsWith(
                      '/' + path,
                    )
                  )
                    continue;
                  const p = doc.querySelector('p');
                  if (!p) continue;
                  const s = frame.contentWindow!.getComputedStyle(p),
                    body = frame.contentWindow!.getComputedStyle(doc.body);
                  return {
                    font: s.fontFamily,
                    size: s.fontSize,
                    justify: s.textAlign,
                    hyphens: s.hyphens,
                    background: body.backgroundColor,
                  };
                }
                return null;
              }, path),
          )
          .toEqual({
            font: '"Literae Lora", Georgia, serif',
            size: '24px',
            justify: 'justify',
            hyphens: 'none',
            background: 'rgb(0, 0, 0)',
          });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        expect(errors).toEqual([]);
        if (row.key === 'femme-pauvre') {
          await page.locator('.reader-settings summary').click();
          const firstChapter = await page
            .locator('[data-reader="toc-link"]')
            .filter({ hasText: /^I$/ })
            .first()
            .getAttribute('data-href');
          await chooseChapterHref(page, firstChapter!);
          await page.locator('[data-reader="viewport"]').screenshot({
            path: info.outputPath('reader.png'),
          });
        }
        if (row.key === 'terre' || row.key === 'pascal')
          await info.attach('reader.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
      });
  });

test('Orthographe modernisée : activation, retour au texte original et persistance', async ({
  page,
  request,
}) => {
  await openBook(page, request, 'Pensées');
  const href = await page
    .locator('[data-reader="toc-link"]')
    .filter({ hasText: /^PREFACE|^Préface/i })
    .first()
    .getAttribute('data-href');
  expect(href).toBeTruthy();
  await chooseChapterHref(page, href!);
  const path = href!.split('#')[0];
  const text = () =>
    page.locator('[data-reader="viewport"]').evaluate((viewport, path) => {
      for (const f of viewport.querySelectorAll('iframe'))
        if (
          f.contentDocument?.documentElement?.dataset.readerSource?.endsWith(
            '/' + path,
          )
        )
          return f.contentDocument.body.textContent;
      return null;
    }, path);
  await expect.poll(text).toMatch(/dessein|Pensées/);
  expect(await text()).not.toContain('ſ');
  await page.locator('.reader-settings summary').click();
  await expect(page.locator('[data-reader="modernize"]')).toBeChecked();
  await page.locator('[data-reader="modernize"]').uncheck();
  await expect.poll(text).toContain('ſ');
  await page.reload();
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.locator('.reader-settings summary').click();
  await expect(page.locator('[data-reader="modernize"]')).not.toBeChecked();
  await expect.poll(text).toContain('ſ');
  await page.locator('[data-reader="modernize"]').check();
  await expect.poll(text).not.toContain('ſ');
});

for (const profile of [profiles[0], profiles[1]])
  test.describe('Couvertures complètes : ' + profile.name, () => {
    test.use({
      userAgent: profile.userAgent,
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
    });
    test('grille et liste, y compris au survol', async ({ page }) => {
      await page.goto('/scriptorium/bibliotheque?q=La%20Terre%20qui%20meurt');
      await expect(page.locator('.book-card')).toHaveCount(1);
      for (const view of ['grid', 'list']) {
        await page.locator(`.view-btn[data-view="${view}"]`).click();
        await page.locator('.book-card a').hover();
        const size = await page
          .locator('.book-card-cover')
          .evaluate(async (container) => {
            const img = container.querySelector('img')!;
            await img.decode();
            const c = container.getBoundingClientRect(),
              i = img.getBoundingClientRect(),
              s = getComputedStyle(img);
            return {
              fit: s.objectFit,
              transform: s.transform,
              clipped:
                i.left < c.left - 1 ||
                i.top < c.top - 1 ||
                i.right > c.right + 1 ||
                i.bottom > c.bottom + 1,
            };
          });
        expect(size).toEqual({
          fit: 'contain',
          transform: 'none',
          clipped: false,
        });
      }
    });
  });
