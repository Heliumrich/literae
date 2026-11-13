import { test, expect, type Page } from '@playwright/test';
const BOSSUET = '/personalites/jacques-benigne-bossuet';
const MAISTRE = '/personalites/joseph-de-maistre';
test.beforeEach(async ({ context }) => {
  await context.route('https://api.literae.ch/**', route => route.abort());
});
async function control(page: Page, title: string) {
  const button = page.getByRole('button', { name: new RegExp('^' + title + ' :') });
  const id = await button.getAttribute('aria-controls');
  return { button, panel: page.locator('#' + id) };
}

test.describe('ordinateur', () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } });
  test('les fiches des auteurs et de leurs ouvrages présentent les mêmes points', async ({ page, request }) => {
    const { items } = await (await request.get('/scriptorium/bibliotheque.json')).json();
    for (const [author, title, path] of [['Bossuet', 'Gallicanisme', BOSSUET], ['Maistre', 'Franc-maçonnerie', MAISTRE]]) {
      const books = items.filter((book: any) => book.author.includes(author));
      expect(books.length).toBeGreaterThan(0);
      for (const url of [path, ...books.map((book: any) => book.href)]) {
        await page.goto(url);
        const { button } = await control(page, title);
        await expect(button).toBeVisible();
        await expect(button).not.toContainText(/\d/);
        await expect(button.locator('strong')).toHaveCount(0);
        expect((await page.locator('.author-dogmas').boundingBox())!.height).toBeLessThan(150);
      }
    }
    await page.goto('/personalites/gustave-dore');
    await expect(page.locator('.author-dogmas')).toHaveCount(0);
  });
  test('le survol permet de lire et rejoindre le panneau, le clic le fixe, Échap le ferme', async ({ page }) => {
    await page.goto(BOSSUET);
    const { button, panel } = await control(page, 'Gallicanisme');
    await button.hover();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.dogma-level strong')).toHaveText('10');
    await expect(panel.locator('.dogma-close')).toBeHidden();
    await panel.locator('.dogma-source').hover();
    await page.waitForTimeout(300);
    await expect(panel).toBeVisible();
    await button.click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await panel.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(panel).toBeHidden();
    await button.focus(); await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.dogma-source')).toHaveAttribute('href', 'https://fr.wikipedia.org/wiki/Gallicanisme');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test('le clic mobile ouvre sans déplacer la page, le panneau reste dans le viewport', async ({ page }) => {
  for (const [width, height] of [[320,740],[390,844],[844,390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(MAISTRE);
    const { button, panel } = await control(page, 'Franc-maçonnerie');
    await button.scrollIntoViewIfNeeded();
    const before = await button.boundingBox();
    await button.tap();
    await expect(panel).toBeVisible();
    const after = await button.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(10);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 10);
    expect(bounds.y).toBeGreaterThanOrEqual(10);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 10);
    await expect(panel.locator('.dogma-description')).toContainText('mondialisation');
    await panel.getByRole('button', { name: 'Fermer', exact: true }).tap();
    await expect(panel).toBeHidden();
  }
});
