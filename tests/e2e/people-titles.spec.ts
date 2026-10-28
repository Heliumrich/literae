import { test, expect } from '@playwright/test';

test('saints : noms des catalogues, auteurs, personnalités et personnes représentées', async ({ page, request }) => {
  const people = (await (await request.get('/personalites.json')).json()).items;
  const augustin = people.find((person: { href: string }) => person.href.endsWith('/aurelius-augustinus'));
  expect(augustin.title).toBe("saint Augustin d'Hippone");
  const books = (await (await request.get('/scriptorium/bibliotheque.json')).json()).items;
  const confessions = books.find((book: { title: string }) => book.title === 'Confessions');
  expect(confessions.author).toBe("saint Augustin d'Hippone");
  await page.goto(confessions.href);
  await expect(page.locator('.book-author')).toHaveText("saint Augustin d'Hippone");
  await page.goto('/personalites/aurelius-augustinus');
  await expect(page.locator('h1')).toHaveText("saint Augustin d'Hippone");
  const biography = page.locator('details.biography');
  await expect(biography).not.toHaveAttribute('open');
  await expect(biography.locator('.biography-text')).toBeHidden();
  await biography.locator('summary').click();
  await expect(biography.locator('.biography-text')).toBeVisible();
  await biography.locator('summary').click();
  await expect(biography.locator('.biography-text')).toBeHidden();
  const representedWork = page.locator('.person-works.depicted .catalog-card-copy').first();
  await expect(representedWork).toHaveCount(1);
  await representedWork.click();
  await expect(page).toHaveURL(/\/oeuvres\//);
  await expect(page.locator('main')).toContainText("saint Augustin d'Hippone");
});
