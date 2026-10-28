import { chooseChapterHref } from './reader-helpers';
import { test, expect, devices } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
test.use({ baseURL: MAIN, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
for (const device of ['Desktop Chrome', 'Pixel 7']) {
  test.describe(device, () => {
    const profile = devices[device];
    test.use({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
    test.beforeEach(async ({ context }) => {
      await context.route(MAIN+'/**', async route => {
        const u = new URL(route.request().url());
        await route.fulfill({ response: await route.fetch({ url: LOCAL+u.pathname+u.search }) });
      });
      if (process.env.LITERAE_PREPARED_EPUB_DIR) await context.route('https://api.literae.ch/assets/**', async route => {
        const id = new URL(route.request().url()).pathname.split('/')[2];
        if (!['bec96cc6-c2b4-4e32-9147-233726a15bad','7fa44cee-e335-48b4-be27-aabcfd0f2bd1'].includes(id)) return route.continue();
        await route.fulfill({ body: await readFile(`${process.env.LITERAE_PREPARED_EPUB_DIR}/${id}.epub`), contentType:'application/epub+zip', headers:{'Access-Control-Allow-Origin':MAIN} });
      });
    });
    for (const bible of [{ name:'Crampon', chapter:'p002-000.xhtml' }, { name:'Glaire', chapter:'p009-000.xhtml' }]) {
      test(`notes ${bible.name} en surimpression sans déplacement ni changement du signet`, async ({ page, request }) => {
        const { items } = await (await request.get(LOCAL+'/scriptorium/bibliotheque.json')).json();
        const item = items.find((b: {title:string}) => b.title.includes(bible.name));
        const errors: string[] = []; page.on('pageerror', e=>errors.push(e.message));
        await page.goto(item.href);
        await expect(page.locator('[data-reader="toc-toggle"]')).toHaveAttribute('aria-disabled', 'false', {timeout:30000});
        await chooseChapterHref(page, bible.chapter);
        let frame;
        await expect.poll(async () => {
          for (const f of page.frames().slice(1)) {
            try { if (await f.locator(`a[href*="literae-notes/${bible.chapter.replace('.xhtml','')}"]`).count()) { frame=f; return true; } } catch { /* continuous reader disposed an old frame */ }
          }
          return false;
        },{timeout:20000}).toBe(true);
        const call = frame!.locator('a[href*="literae-notes/"]').first();

        const id = await page.locator('[data-reader="edition"]').inputValue();
        await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`)||'{}').cfi,id)).toMatch(/^epubcfi/);
        await page.waitForTimeout(150);
        await page.evaluate(id => {
          document.querySelector('dialog')!.addEventListener('beforetoggle', event => {
            if ((event as ToggleEvent).newState === 'open') (window as any).__noteBookmark = JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`)||'{}').cfi;
          });
        }, id);
        await expect.poll(async () => {
          for (const f of page.frames().slice(1)) { try {
            const a=f.locator(`a[href*="literae-notes/${bible.chapter.replace('.xhtml','')}"]`).first();
            if(await a.count()) { await f.evaluate(() => document.fonts.ready); await a.click(); frame=f; return await page.getByRole('dialog').isVisible(); }
          } catch {} }
          return false;
        }).toBe(true);
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.locator('[data-reader="note-body"]')).not.toContainText('Chargement de la note');
        await expect(page.locator('[data-reader="note-body"]')).not.toContainText('ne peut pas être chargée');
        expect((await page.locator('[data-reader="note-body"]').textContent())!.length).toBeGreaterThan(10);
        expect(await frame!.locator('[epub\\:type="footnote"]').count()).toBe(0);
        expect(await page.locator('[data-reader="toc-link"]').evaluateAll(links=>links.some(link=>(link as HTMLElement).dataset.href?.includes('literae-notes/')))).toBe(false);
        await page.getByRole('button',{name:'Fermer la note'}).click();
        expect(await page.evaluate(id=>JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`)||'{}').cfi,id)).toBe(await page.evaluate(() => (window as any).__noteBookmark));
        await page.locator('[data-reader="fullscreen"]').click();
        await expect.poll(async () => {
          for (const f of page.frames().slice(1)) { try { const a=f.locator('a[href*="literae-notes/"]').first(); if(await a.count()) { await f.evaluate(() => document.fonts.ready); await a.click(); return await page.getByRole('dialog').isVisible(); } } catch {} }
          return false;
        }).toBe(true);
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });
}
