import { mkdir, open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { prepare, publish } from './art-deep-zoom.mjs';
import { deepZoomKeyPattern } from './art-media-paths.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const api = 'https://api.literae.ch/items/artworks';
const fields = 'id,slug,status,title_french,title_original,title_english,deep_zoom_key';
const [manifest, output, maxItems = '0', mode = 'run'] = process.argv.slice(2);
const token = process.env.ART_DIRECTUS_TOKEN;
const limit = Number(maxItems);

async function json(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function directus(path, body) {
  const response = await fetch(`${api}${path}`, {
    method: body ? 'PATCH' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Directus HTTP ${response.status} (${body ? 'liaison' : 'lecture'}).`);
  return (await response.json()).data;
}

async function save(path, entry) {
  const pending = `${path}.${process.pid}.tmp`;
  const handle = await open(pending, 'w');
  try {
    await handle.writeFile(JSON.stringify(entry, null, 2) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
  await rename(pending, path);
}

async function entries() {
  const map = await json(manifest);
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Le manifeste doit être un objet UUID → fichier.');
  const paths = new Set();
  const items = [];
  for (const [id, source] of Object.entries(map)) {
    if (!uuid.test(id) || typeof source !== 'string' || !isAbsolute(source)) throw new Error(`Entrée de manifeste invalide : ${id}`);
    const actual = await realpath(source);
    if (!(await stat(actual)).isFile()) throw new Error(`Source non valide : ${source}`);
    const unique = process.platform === 'win32' ? actual.toLowerCase() : actual;
    if (paths.has(unique)) throw new Error(`Un fichier est associé à plusieurs fiches : ${actual}`);
    paths.add(unique);
    items.push({ id, source: actual });
  }
  return items;
}

async function main() {
  if (!manifest || !output || !token || !Number.isInteger(limit) || limit < 0 || !['run', 'plan', 'audit'].includes(mode)) {
    throw new Error('Usage : migrate-art-media.mjs <manifeste.json> <sortie> [limite, 0 = toutes] [run|plan|audit] avec ART_DIRECTUS_TOKEN.');
  }
  const base = resolve(output);
  const journal = join(base, 'journal');
  await mkdir(journal, { recursive: true });
  const items = await entries();
  if (mode === 'audit') {
    await audit(items.slice(0, limit || items.length), base, journal);
    return;
  }
  let completed = 0, skipped = 0;
  for (const { id, source } of items) {
    if (limit && completed >= limit) break;
    const path = join(journal, `${id}.json`);
    const checkpoint = await json(path).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const item = await directus(`/${id}?fields=${fields}`);
    if (item.id !== id || item.status !== 'published') throw new Error(`Fiche non publiée ou inattendue : ${id}.`);
    if (checkpoint && (checkpoint.id !== id || checkpoint.source !== source || !deepZoomKeyPattern.test(checkpoint.key) ||
      !checkpoint.key.startsWith(`${id}/`) || checkpoint.bucket !== process.env.ART_S3_BUCKET || checkpoint.endpoint !== process.env.ART_S3_ENDPOINT)) {
      throw new Error(`Le journal et le manifeste diffèrent pour ${item.slug}. Vérifier ${path}.`);
    }
    if (item.deep_zoom_key) {
      if (checkpoint && item.deep_zoom_key !== checkpoint.key) throw new Error(`La clé Directus de ${item.slug} a changé. Voir ${path}.`);
      if (checkpoint && checkpoint.phase !== 'linked' && mode === 'run') await save(path, { ...checkpoint, phase: 'linked' });
      skipped++;
      continue;
    }
    if (checkpoint?.phase === 'linked') throw new Error(`La clé de ${item.slug} a été retirée dans Directus. Vérifier ${path}.`);
    const title = item.title_french || item.title_original || item.title_english || item.slug;
    console.log(`${mode === 'plan' ? 'Prévu' : 'Import'} : ${title} (${id}) ← ${source}`);
    if (mode === 'plan') { completed++; continue; }
    let record = checkpoint;
    if (!record) {
      const directory = await prepare(id, source, base);
      record = {
        id, slug: item.slug, title, source, key: `${id}/${basename(directory)}`,
        bucket: process.env.ART_S3_BUCKET, endpoint: process.env.ART_S3_ENDPOINT,
        phase: 'prepared',
      };
      await save(path, record); // Persist the link before the first PUT to S3.
    }
    try {
      const latest = await directus(`/${id}?fields=id,status,deep_zoom_key`);
      if (latest.id !== id || latest.status !== 'published' || latest.deep_zoom_key !== item.deep_zoom_key) {
        throw new Error('La fiche a changé pendant la préparation. Relire son état dans Directus.');
      }
      await publish(join(base, record.key), { verify: true });
      record = { ...record, phase: 'uploaded' };
      await save(path, record);
      const empty = item.deep_zoom_key === '' ? { _eq: '' } : { _null: true };
      const changed = await directus(`?fields=${fields}`, {
        query: { filter: { id: { _eq: id }, status: { _eq: 'published' }, deep_zoom_key: empty } },
        data: { deep_zoom_key: record.key },
      });
      if (changed.length !== 1 || changed[0].id !== id || changed[0].deep_zoom_key !== record.key) {
        throw new Error('La mise à jour conditionnelle n’a modifié aucune fiche attendue.');
      }
      await save(path, { ...record, phase: 'linked' });
      console.log(`Liée : ${item.slug} → ${record.key}`);
      completed++;
    } catch (error) {
      throw new Error(`${item.slug} : ${error.message} Reprise depuis ${path}.`, { cause: error });
    }
  }
  console.log(`${completed} ${mode === 'plan' ? 'prévues' : 'liées'}, ${skipped} déjà liées.`);
}

async function audit(items, base, journal) {
  const records = new Map();
  for (let page = 1; ; page++) {
    const rows = await directus(`?fields=${fields}&limit=100&sort=id&page=${page}`);
    for (const row of rows) records.set(row.id, row);
    if (rows.length < 100) break;
  }
  const result = { at: new Date().toISOString(), expected: items.length, verified: 0, previouslyLinked: 0, issues: [] };
  for (const { id, source } of items) {
    const item = records.get(id);
    try {
      if (item?.status !== 'published' || !deepZoomKeyPattern.test(item.deep_zoom_key || '')) throw new Error('Fiche publiée ou clé Deep Zoom absente.');
      const path = join(journal, `${id}.json`);
      const checkpoint = await json(path).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!checkpoint) {
        const response = await fetch(`https://art.literae.ch/art-media/${item.deep_zoom_key}/image.dzi`, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Descripteur public HTTP ${response.status}.`);
        await response.arrayBuffer();
        result.previouslyLinked++;
      } else {
        if (checkpoint.phase !== 'linked' || checkpoint.key !== item.deep_zoom_key || checkpoint.source !== source ||
          checkpoint.bucket !== process.env.ART_S3_BUCKET || checkpoint.endpoint !== process.env.ART_S3_ENDPOINT) {
          throw new Error('Journal, fichier et clé Directus non concordants.');
        }
        await publish(join(base, checkpoint.key), { auditOnly: true });
        result.verified++;
      }
    } catch (error) {
      result.issues.push({ id, slug: item?.slug, source, message: error.message });
    }
    await pause(100);
  }
  await save(join(base, 'audit-migration.json'), result);
  console.log(`${result.verified} pyramides auditées, ${result.previouslyLinked} descripteurs antérieurs vérifiés, ${result.issues.length} anomalies.`);
  if (result.issues.length) throw new Error(`Voir ${join(base, 'audit-migration.json')}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
