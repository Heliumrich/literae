import { test, expect, devices, type Page, type Frame } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import matrix from '../fixtures/notes-catalog.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';
const MAIN = 'https://literae.ch',
  LOCAL = 'http://127.0.0.1:4322';
const readerIds = new Set(matrix.map((book) => book.fileId));
type Load = {
  path: string;
  source: string;
  reason: string;
  state: string;
  context: string[];
};
type Open = { path: string; id: string; cached: boolean; elapsedMs: number };

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
async function selectSection(page: Page, href: string) {
  const links = await page
    .locator('[data-reader="toc-link"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLElement).dataset.href!),
    );
  const exact = links.find((target) => target.split('#')[0] === href);
  if (exact) {
    await chooseChapterHref(page, exact);
    return;
  }
  // Some large chapters span multiple XHTMLs but have a single TOC entry.
  // Reach the continuation by scrolling, just as a reader would.
  const previous =
    links.filter((target) => target.split('#')[0] < href).at(-1) ||
    links.find((target) => target.split('#')[0] === 'titlepage.xhtml');
  expect(previous, `Partie précédant ${href}`).toBeTruthy();
  await chooseChapterHref(page, previous!);
  await expect
    .poll(
      async () =>
        page.locator('.epub-container').evaluate((container, href) => {
          const frame = [...container.querySelectorAll('iframe')].find(
            (frame) =>
              frame.contentDocument?.documentElement?.dataset.readerSource?.endsWith(
                '/' + href,
              ),
          );
          if (frame) {
            container.scrollTop +=
              frame.getBoundingClientRect().top -
              container.getBoundingClientRect().top;
            return true;
          }
          container.scrollTop = container.scrollHeight;
          return false;
        }, href),
      { timeout: 15000 },
    )
    .toBe(true);
}
async function frameWith(page: Page, selector: string): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of page.frames().slice(1))
        try {
          if (await frame.locator(selector).count()) {
            found = frame;
            return true;
          }
        } catch {}
      return false;
    })
    .toBe(true);
  return found!;
}
for (const device of ['Desktop Chrome', 'Pixel 7']) {
  test.describe(`Notes de tous les ouvrages : ${device}`, () => {
    const profile = devices[device];
    test.use({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      userAgent: profile.userAgent,
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    test.beforeEach(async ({ context }) => {
      await context.route(MAIN + '/**', async (route) => {
        const url = new URL(route.request().url());
        await route.fulfill({
          response: await route.fetch({
            url: LOCAL + url.pathname + url.search,
          }),
        });
      });
      if (process.env.LITERAE_PREPARED_EPUB_DIR)
        await context.route(
          'https://api.literae.ch/assets/**',
          async (route) => {
            const id = new URL(route.request().url()).pathname.split('/')[2];
            if (!readerIds.has(id)) return route.continue();
            await route.fulfill({
              body: await readFile(
                `${process.env.LITERAE_PREPARED_EPUB_DIR}/${id}.epub`,
              ),
              contentType: 'application/epub+zip',
              headers: { 'Access-Control-Allow-Origin': MAIN },
            });
          },
        );
      await context.addInitScript(() => {
        const events = {
          loads: [] as unknown[],
          contexts: [] as unknown[],
          opens: [] as unknown[],
          bookmark: null as string | null,
        };
        (window as any).__notesAudit = events;
        for (const [name, key] of [
          ['notes-load', 'loads'],
          ['notes-context', 'contexts'],
          ['note-opened', 'opens'],
        ] as const)
          document.addEventListener(`reader:${name}`, (event) =>
            events[key].push((event as CustomEvent).detail),
          );
        document.addEventListener(
          'beforetoggle',
          (event) => {
            if (
              (event.target as HTMLElement)?.matches?.(
                '[data-reader="note-dialog"]',
              ) &&
              (event as ToggleEvent).newState === 'open'
            ) {
              const id = (
                document.querySelector(
                  '[data-reader="edition"]',
                ) as HTMLSelectElement
              ).value;
              events.bookmark = JSON.parse(
                localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}',
              ).cfi;
            }
          },
          true,
        );
      });
    });
    test.afterEach(async ({ page, context }, info) => {
      // Let outstanding asset routes finish before Playwright disposes fetch responses.
      await context.unrouteAll({ behavior: 'wait' });
      if (info.status === info.expectedStatus) return;
      const audit = await page
        .evaluate(() => ({
          audit: (window as any).__notesAudit,
          frames: [
            ...document.querySelectorAll<HTMLIFrameElement>('iframe'),
          ].map((frame) => ({
            source:
              frame.contentDocument?.documentElement?.dataset.readerSource,
            rect: frame.getBoundingClientRect().toJSON(),
          })),
        }))
        .catch(() => null);
      await info.attach('failed-notes-audit', {
        body: JSON.stringify(audit, null, 2),
        contentType: 'application/json',
      });
      await writeFile(
        info.outputPath('failed-notes-audit.json'),
        JSON.stringify(audit, null, 2),
      );
    });
    for (const book of matrix)
      test(book.title, async ({ page, request }, testInfo) => {
        test.setTimeout(180000);
        const catalogue = (
          await (
            await request.get(LOCAL + '/scriptorium/bibliotheque.json')
          ).json()
        ).items;
        const item = catalogue.find(
          (item: { id: string }) => item.id === book.bookId,
        );
        const errors: string[] = [],
          httpNotes: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (
            /^https?:/.test(request.url()) &&
            request.url().includes('/literae-notes/')
          )
            httpNotes.push(request.url());
        });
        await page.goto(item.href);
        await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute(
          'aria-busy',
          'false',
        );
        const editions = JSON.parse(
          (await page.locator('.epub-reader').getAttribute('data-editions')) ||
            '[]',
        );
        const selected = editions.find(
          (e: { id: string }) => e.id === book.fileId,
        );
        expect(selected.downloadUrl).not.toBe(selected.url);
        await expect(page.locator('[data-reader="download"]')).toHaveAttribute(
          'href',
          selected.downloadUrl,
        );
        expect(
          await page
            .locator('[data-reader="toc-link"]')
            .evaluateAll((links) =>
              links.some((link) =>
                (link as HTMLElement).dataset.href?.includes('literae-notes/'),
              ),
            ),
        ).toBe(false);
        for (const sample of book.samples) {
          await selectSection(page, sample.href);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
          ).toBe(false);
          const sectionFrame = await frameWith(
            page,
            `html[data-reader-source="/${sample.source}"]`,
          );
          expect(
            await sectionFrame
              .locator('p,li')
              .evaluateAll((elements) =>
                elements.some((element) =>
                  /[ \t\r\n\u202f]+[:;?!]/.test(element.textContent || ''),
                ),
              ),
          ).toBe(false);
          if (!sample.reference) continue;
          const ref = sample.reference;
          await expect
            .poll(() =>
              page.evaluate(
                (path) =>
                  (window as any).__notesAudit.contexts.some((context: any) =>
                    context.ready.includes('/' + path),
                  ),
                ref.path,
              ),
            )
            .toBe(true);
          const selector = `a.literae-noteref[href="${ref.href}"]`;
          let frame = await frameWith(page, selector);
          await frame.evaluate(() => document.fonts.ready);
          const styles = await frame
            .locator(selector)
            .first()
            .evaluate((element) => {
              const style = getComputedStyle(element);
              return {
                size: parseFloat(style.fontSize),
                align: style.verticalAlign,
                parent: parseFloat(
                  getComputedStyle(element.parentElement!).fontSize,
                ),
              };
            });
          expect(styles.align).toBe('super');
          expect(styles.size).toBeLessThan(styles.parent * 0.85);
          expect(await frame.locator('[epub\\:type="footnote"]').count()).toBe(
            0,
          );
          expect(
            await frame
              .locator('p,li')
              .evaluateAll((elements) =>
                elements.some((element) =>
                  /[ \t\r\n\u202f]+[:;?!]/.test(element.textContent || ''),
                ),
              ),
          ).toBe(false);
          const previous = await page.evaluate(
            () => (window as any).__notesAudit.opens.length,
          );
          await expect
            .poll(async () => {
              for (const candidate of page.frames().slice(1))
                try {
                  const link = candidate.locator(selector).first();
                  if (await link.count()) {
                    await link.click();
                    frame = candidate;
                    return await page.getByRole('dialog').isVisible();
                  }
                } catch {}
              return false;
            })
            .toBe(true);
          await expect(
            page.locator('[data-reader="note-body"]'),
          ).not.toContainText('Chargement de la note');
          await expect(
            page.locator('[data-reader="note-body"]'),
          ).not.toContainText('ne peut pas être chargée');
          expect(
            (await page
              .locator('[data-reader="note-body"]')
              .textContent())!.trim().length,
          ).toBeGreaterThan(0);
          expect(
            await page.locator('[data-reader="note-body"]').evaluate((body) => {
              // Check the EPUB note, not the independently loaded SQLite text.
              const note = body.cloneNode(true) as HTMLElement;
              note.querySelector('.reader-bible-passages')?.remove();
              return note.textContent;
            }),
          ).not.toMatch(/[ \t\r\n\u202f]+[:;?!]/);
          const opened: Open = await page.evaluate(
            (index) => (window as any).__notesAudit.opens[index],
            previous,
          );
          expect(opened.path).toBe('/' + ref.path);
          expect(opened.cached).toBe(true);
          expect(opened.elapsedMs).toBeLessThan(250);
          await page.getByRole('button', { name: 'Fermer la note' }).click();
          expect(
            await page.evaluate(
              (id) =>
                JSON.parse(
                  localStorage.getItem(`literae-epub-progress-v2:${id}`) ||
                    '{}',
                ).cfi,
              book.fileId,
            ),
          ).toBe(
            await page.evaluate(() => (window as any).__notesAudit.bookmark),
          );
        }
        const first = book.samples.find((sample) => sample.reference);
        if (first?.reference) {
          await selectSection(page, first.href);
          const selector = `a.literae-noteref[href="${first.reference.href}"]`;
          await frameWith(page, selector);
          await page.locator('[data-reader="fullscreen"]').click();
          await expect
            .poll(async () => {
              for (const f of page.frames().slice(1))
                try {
                  const link = f.locator(selector).first();
                  if (await link.count()) {
                    await link.click();
                    return await page.getByRole('dialog').isVisible();
                  }
                } catch {}
              return false;
            })
            .toBe(true);
          await expect(page.getByRole('dialog')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toBeHidden();
        }
        const audit = await page.evaluate(() => (window as any).__notesAudit);
        for (const load of audit.loads as Load[])
          if (load.state === 'start' && load.reason !== 'click') {
            expect(load.context.length).toBeLessThanOrEqual(3);
            expect(load.context).toContain(load.source);
          }
        for (const context of audit.contexts)
          expect(context.cached.length).toBeLessThanOrEqual(
            Math.max(6, context.paths.length),
          );
        expect(httpNotes).toEqual([]);
        expect(errors).toEqual([]);
        const report = {
          title: book.title,
          device,
          samples: book.samples.length,
          preloads: audit.loads.filter((e: Load) => e.state === 'ready').length,
          opens: audit.opens,
        };
        await testInfo.attach('notes-performance.json', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });
        await writeFile(
          testInfo.outputPath('notes-performance.json'),
          JSON.stringify(report, null, 2),
        );
      });
  });
}
