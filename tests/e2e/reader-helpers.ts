import { expect, type Page } from '@playwright/test';

export async function openToc(page: Page) {
  const disclosure = page.locator('[data-reader="toc"]');
  if (!await disclosure.evaluate(element => (element as HTMLDetailsElement).open)) await page.locator('[data-reader="toc-toggle"]').click();
}
export async function chooseChapter(page: Page, label: string) {
  await openToc(page);
  await page.locator('[data-reader="toc-link"]').filter({ hasText: new RegExp(`^${label}$`) }).click();
}
export async function expectCurrentChapter(page: Page, href: string) {
  await expect(page.locator('[data-reader="toc"]')).toHaveAttribute('data-current-href', href);
}

export async function chooseChapterHref(page: Page, href: string) {
  await openToc(page);
  const chapter = page.locator(`[data-reader="toc-link"][data-href="${href}"]`).last();
  const parents = await chapter.evaluate(element => {
    const ids: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'UL' && parent.hidden) ids.unshift(parent.id);
    }
    return ids;
  });
  for (const id of parents) await page.locator(`[data-reader="toc-expand"][aria-controls="${id}"]`).click();
  await chapter.click();
}
