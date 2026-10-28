import { expect, type Page, type Locator } from '@playwright/test';

export async function openToc(page: Page) {
  const disclosure = page.locator('[data-reader="toc"]');
  if (
    !(await disclosure.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    ))
  )
    await page.locator('[data-reader="toc-toggle"]').click();
}
async function clickChapter(page: Page, chapter: Locator) {
  const href = await chapter.getAttribute('data-href');
  // A first display may still be resolving fonts. Scroll tests must wait for the
  // same completion as a reader, otherwise their synthetic scroll races reflow.
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.epub-reader')!;
    delete root.dataset.testChapterPositioned;
    root.addEventListener(
      'reader:chapter-positioned',
      (event) => {
        root.dataset.testChapterPositioned = (event as CustomEvent).detail.href;
      },
      { once: true },
    );
  });
  await chapter.click();
  await expect(page.locator('.epub-reader')).toHaveAttribute(
    'data-test-chapter-positioned',
    href!,
    { timeout: 20000 },
  );
}
export async function chooseChapter(page: Page, label: string) {
  await openToc(page);
  await clickChapter(
    page,
    page
      .locator('[data-reader="toc-link"]')
      .filter({ hasText: new RegExp(`^${label}$`) }),
  );
}
export async function expectCurrentChapter(page: Page, href: string) {
  await expect(page.locator('[data-reader="toc"]')).toHaveAttribute(
    'data-current-href',
    href,
  );
}

export async function chooseChapterHref(page: Page, href: string) {
  await openToc(page);
  const chapter = page
    .locator(`[data-reader="toc-link"][data-href="${href}"]`)
    .last();
  const parents = await chapter.evaluate((element) => {
    const ids: string[] = [];
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (parent.tagName === 'UL' && parent.hidden) ids.unshift(parent.id);
    }
    return ids;
  });
  for (const id of parents)
    await page
      .locator(`[data-reader="toc-expand"][aria-controls="${id}"]`)
      .click();
  await clickChapter(page, chapter);
}
