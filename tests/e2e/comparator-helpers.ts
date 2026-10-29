import { expect, type Page } from '@playwright/test';

export async function openOfflinePanel(page: Page) {
  const button = page.getByRole('button', { name: 'Emporter le comparateur', exact: true });
  const dialog = page.locator('#comparator-offline-dialog');
  await expect(button).toBeVisible();
  if (!(await dialog.isVisible())) {
    // A PWA update can open the same modal between the check and the click.
    try { await button.click({ timeout: 2000 }); }
    catch (error) { if (!(await dialog.isVisible())) throw error; }
  }
  await expect(dialog).toBeVisible();
}

export async function closeOfflinePanel(page: Page) {
  const dialog = page.locator('#comparator-offline-dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Fermer Emporter le comparateur', exact: true }).click();
  await expect(dialog).toBeHidden();
}
