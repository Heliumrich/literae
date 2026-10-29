import { openOfflinePanel, closeOfflinePanel } from './comparator-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveBibleSource } from '../../src/lib/bible-source.mjs';

const route = '/scriptorium/comparateur';
async function open(page: Page) {
  await page.goto(route);
  await expect(page.locator('.verse p').first()).toContainText('Dieu');
  await openOfflinePanel(page);
}
async function download(page: Page) {
  await page.getByRole('button', { name: 'Télécharger la Bible', exact: true }).click();
  await expect(page.locator('.offline-panel [role="status"]')).toHaveText('La Bible et le lecteur sont disponibles hors ligne sur cet appareil.', { timeout: 60000 });
  await closeOfflinePanel(page);
}

test('toute la Bible reste lisible après fermeture de la page et réouverture hors ligne', async ({ page, context }) => {
  // Disable the HTTP cache: offline readiness must come from the service worker and IndexedDB.
  await context.route('**/*', route => route.continue());
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const original = await page.locator('.verse p').allTextContents();
  await download(page);
  await expect(page.locator('.verse p').first()).toContainText('Dieu');
  expect(await page.locator('.verse p').allTextContents()).toEqual(original);
  const native = await (await page.request.get('/api/bible/verses?book=GEN&chapter=1&t=1&t=2')).json();
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', {get: () => true}));
  await context.setOffline(true);
  await page.close();
  const offline = await context.newPage();
  offline.on('pageerror', error => errors.push(error.message));
  await offline.goto(route + '?ref=Gen%C3%A8se%201');
  await expect(offline.locator('.translation-page').first().locator('.verse')).toHaveCount(31);
  expect(await offline.locator('.translation-page').first().locator('.verse p').allTextContents()).toEqual(native.results[0].verses.map((v: {text: string}) => v.text));
  await offline.getByRole('button', { name: 'Passage suivant', exact: true }).click();
  await expect(offline.locator('.passage-navigation h2')).toContainText('2');
  await offline.locator('#cmp-ref').fill('Apocalypse 22:20-21');
  await offline.getByRole('button', { name: 'Charger ce passage', exact: true }).click();
  await expect(offline.locator('.translation-page').first().locator('.verse')).toHaveCount(2);
  await offline.locator('#cmp-tr-0').selectOption('5');
  await expect(offline.locator('.translation-code').first()).toContainText('VUL');
  await expect(offline.locator('.verse p').first()).toContainText('Etiam');
  await offline.getByRole('group', {name:'Pages en regard'}).getByRole('button', {name:'4',exact:true}).click();
  await expect(offline.locator('.translation-page')).toHaveCount(4);
  const width = await offline.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  expect(errors).toEqual([]);
});

test('un téléchargement interrompu peut être repris et la copie supprimée', async ({ page, context }) => {
  await open(page);
  await context.route('**/scriptorium/donnees/*.db', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Télécharger la Bible', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Télécharger la Bible', exact: true })).toBeEnabled();
  await expect(page.locator('.verse p').first()).toContainText('Dieu');
  await context.unroute('**/scriptorium/donnees/*.db');
  await download(page);
  await openOfflinePanel(page);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Supprimer la copie locale', exact: true }).click();
  await expect(page.locator('.offline-panel [role="status"]')).toHaveText('La copie locale a été supprimée.');
  await context.setOffline(true);
  await page.reload();
  await page.locator('#cmp-ref').fill('Matthieu 5');
  await page.getByRole('button', { name: 'Charger ce passage', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Téléchargez d’abord la Bible');
});

test('l’invitation Android utilise le dialogue natif sur action explicite', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const invitation = new Event('beforeinstallprompt');
    Object.assign(invitation, {
      prompt: async () => { document.documentElement.dataset.installPrompt = 'opened'; },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(invitation);
  });
  await expect(page.getByRole('button', {name: 'Installer le comparateur',exact:true})).toBeVisible();
  await page.getByRole('button', {name: 'Installer le comparateur',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-install-prompt','opened');
});

test('iPhone affiche les étapes d’installation Safari', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322' + route);
  await openOfflinePanel(page);
  await page.getByRole('button', {name:'Installer le comparateur',exact:true}).click();
  await expect(page.getByText('Sur iPhone ou iPad :',{exact:true})).toBeVisible();
  await expect(page.getByText('Partager',{exact:true})).toBeVisible();
  await expect(page.locator('.offline-body')).toContainText('téléchargez la Bible depuis l’application installée');
  await context.close();
});

test('une mise à jour échouée conserve la copie précédente et ses passages hors ligne', async ({ page, context }) => {
  await open(page);
  await download(page);
  // Simulate a previous data release; its database bytes remain a valid Bible.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('literae-bible', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('database', 'readwrite');
        const store = tx.objectStore('database');
        const get = store.get('current');
        get.onsuccess = () => store.put({ ...get.result, sha256: 'old-release', version: 'previous' }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', {get: () => true}));
  const bytes = readFileSync(resolveBibleSource().path);
  await context.route('**/api/bible/verses?pwa=latest', route => route.fulfill({
    headers: {'Access-Control-Allow-Origin':'*'},
    json: {version:'2.1.1',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'/api/bible/verses?pwa=download&asset=999'},
  }));
  await page.reload();
  await openOfflinePanel(page);
  await expect(page.getByRole('dialog').getByRole('button',{name:'Mettre à jour la Bible',exact:true})).toBeVisible();
  await context.route('**/api/bible/verses?pwa=download&asset=999', route => route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},body:'interrupted'}));
  await page.getByRole('dialog').getByRole('button',{name:'Mettre à jour la Bible',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Téléchargement incomplet');
  await context.setOffline(true);
  await page.reload();
  await page.locator('#cmp-ref').fill('Psaume 22');
  await page.getByRole('button',{name:'Charger ce passage',exact:true}).click();
  await expect(page.locator('.translation-page').first().locator('.verse p').first()).toContainText('C’est le Seigneur qui me conduit');
  await openOfflinePanel(page);
  await expect(page.locator('.offline-body')).toContainText('Version locale : previous');
});

test('un téléchargement peut être annulé sans conserver de base incomplète', async ({ page, context }) => {
  await open(page);
  let started!: () => void;
  let release!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/scriptorium/donnees/*.db', async route => {
    started();
    await blocked;
    await route.abort().catch(() => {});
  });
  try {
    await page.getByRole('button',{name:'Télécharger la Bible',exact:true}).click();
    await requested;
    await page.getByRole('button',{name:'Annuler',exact:true}).click();
    await expect(page.locator('.offline-panel [role="status"]')).toHaveText('Téléchargement annulé.');
    await expect(page.getByRole('button',{name:'Télécharger la Bible',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Supprimer la copie locale',exact:true})).toHaveCount(0);
  } finally { release(); }
});

test('le manque d’espace est signalé avant le transfert', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = async () => ({ quota: 1024, usage: 0 });
  });
  await open(page);
  await page.getByRole('button',{name:'Télécharger la Bible',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Espace insuffisant');
  await expect(page.getByRole('button',{name:'Télécharger la Bible',exact:true})).toBeEnabled();
});

test('une base corrompue est rejetée même si sa taille est correcte', async ({ page, context }) => {
  await open(page);
  await context.route('**/scriptorium/donnees/*.db', async route => {
    const response = await route.fetch();
    const body = await response.body();
    body[body.length - 1] ^= 1;
    await route.fulfill({ response, body });
  });
  await page.getByRole('button',{name:'Télécharger la Bible',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('La vérification du téléchargement a échoué');
  await expect(page.getByRole('button',{name:'Supprimer la copie locale',exact:true})).toHaveCount(0);
});
