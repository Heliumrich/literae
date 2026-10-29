import { test, expect, devices, type Page, type Frame } from '@playwright/test';
import { chooseChapterHref } from './reader-helpers';
const MAIN='https://literae.ch', LOCAL='http://127.0.0.1:4322';
test.use({baseURL:MAIN,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
test.beforeEach(async({context})=>{ await context.route(MAIN+'/**',async route=>{const u=new URL(route.request().url()); await route.fulfill({response:await route.fetch({url:LOCAL+u.pathname+u.search})});}); });
test.afterEach(async({context})=>{await context.unrouteAll({behavior:'wait'});});
async function chapter(page:Page,id:string,path:string):Promise<Frame>{
 const {items}=await(await page.request.get(LOCAL+'/scriptorium/bibliotheque.json')).json();
 await page.goto(items.find((b:{id:string})=>b.id===id).href);
 await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy','false',{timeout:30000});
 const href=await page.locator('[data-reader="toc-link"]').evaluateAll((links,path)=>links.map(a=>(a as HTMLElement).dataset.href!).find(h=>h.split('#')[0]===path),path);
 await chooseChapterHref(page,href!);
 let found:Frame|undefined;
 await expect.poll(async()=>{for(const frame of page.frames().slice(1))try{if(await frame.locator(`html[data-reader-source$="/${path}"]`).count()){found=frame;return true;}}catch{}return false;}).toBe(true);
 return found!;
}
for(const profile of [{name:'desktop',...devices['Desktop Chrome']},{name:'mobile',...devices['Pixel 7']}])test.describe(profile.name,()=>{
 test.use({viewport:profile.viewport,isMobile:profile.isMobile,hasTouch:profile.hasTouch});
 test('Maistre : un seul appel par note au chapitre VI',async({page})=>{
  const frame=await chapter(page,'5090cade-8eb5-45db-a44c-4f0576f1a25e','section-007.xhtml');
  for(const n of [2,5,7]){
   const link=frame.locator('a.literae-noteref').filter({hasText:new RegExp('^\\['+n+'\\]$')});
   await expect(link).toHaveCount(1); await link.click();
   await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.locator('[data-reader="note-body"]')).not.toContainText('Chargement de la note');
   await page.getByRole('button',{name:'Fermer la note'}).click();
  }
 });
 test('Sacerdoce : pagination supprimée et Timothée corrigé',async({page})=>{
  const frame=await chapter(page,'17d0f5b4-f373-4ce8-ba03-9234dc1667ce','section-002.xhtml');
  await expect(frame.locator('body')).not.toContainText('(574)');
  await frame.locator('.reader-inline-bible[data-reference="2 Tm 2:25–26"]').first().click();
  await expect(page.getByRole('dialog')).toContainText('Bible Fillion');
  await expect(page.locator('.reader-bible-location')).toHaveText('Chapitre 2, versets 25 à 26.');
  await page.getByRole('button',{name:'Fermer la note'}).click();
 });
 test('Philippiens : versets entre parenthèses conservés',async({page})=>{
  const frame=await chapter(page,'03d15abc-45a1-45bc-a078-7a1741b7b85c','section-002.xhtml');
  await expect(frame.locator('body')).toContainText('(6)');
  await expect(frame.locator('body')).not.toContainText('(10)');
 });
});
