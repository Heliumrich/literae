import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { HeadObjectCommand, paginateListObjectsV2, PutObjectCommand } from '@aws-sdk/client-s3';
import { artCacheControl, artContentType, artworkIdPattern, deepZoomKeyPattern, artObjectPattern } from './art-media-paths.mjs';
import { artStorage } from './art-storage.mjs';

const vips = process.env.ART_VIPS || 'vips';
const quality = Number(process.env.ART_TILE_QUALITY || 88);
const tileSize = 512;
const overlap = 1;
const recipe = `dzi-v1-srgb-autorot-webp-${tileSize}-${overlap}-Q${quality}`;

function runVips(args, executable = vips, env = process.env) {
  const result = spawnSync(executable, args, { encoding: 'utf8', env, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || 'Échec de libvips');
  return result.stdout;
}

export async function prepare(id, source, output) {
  if (!artworkIdPattern.test(id) || !Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('Identifiant ou qualité invalide.');
  const hash = createHash('sha256').update(recipe + '\0');
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  const version = hash.digest('hex').slice(0, 24);
  const parent = resolve(output, id);
  const target = join(parent, version);
  await mkdir(parent, { recursive: true });
  if (await stat(join(target, 'image.dzi')).catch(() => null)) return target;
  const stage = await mkdtemp(join(parent, '.prepare-'));
  if (dirname(resolve(stage)) !== parent) throw new Error('Répertoire temporaire hors du dossier de sortie.');
  const temp = { ...process.env, TMPDIR: stage, TMP: stage, TEMP: stage, VIPS_CONCURRENCY: process.env.VIPS_CONCURRENCY || '4' };
  try {
    const header = vips.replace(/vips(\.exe)?$/i, 'vipsheader$1');
    const info = runVips(['-a', source], header, temp);
    const normalized = join(stage, 'normalized.v');
    const color = info.includes('icc-profile-data:') ? ['icc_transform', source, normalized, 'srgb', '--embedded']
      : ['colourspace', source, normalized, 'srgb'];
    runVips(color, vips, temp);
    const rotated = join(stage, 'upright.v');
    runVips(['autorot', normalized, rotated], vips, temp);
    await rm(normalized);
    runVips(['dzsave', rotated, join(stage, 'image'), '--layout=dz', '--depth=onepixel', `--tile-size=${tileSize}`, `--overlap=${overlap}`,
      `--suffix=.webp[Q=${quality},keep=none,smart-subsample]`], vips, temp);
    runVips(['thumbnail', rotated, join(stage, 'preview.webp[Q=86,keep=none]'), '1600', '--height=1600', '--size=down'], vips, temp);
    runVips(['thumbnail', join(stage, 'preview.webp'), join(stage, 'thumb.webp[Q=84,keep=none]'), '480', '--height=480', '--size=down'], vips, temp);
    await rm(rotated);
    await rename(stage, target);
    return target;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function collect(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await collect(join(directory, entry.name), `${relative}/`));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function md5(bytes) {
  return createHash('md5').update(bytes).digest('hex');
}

// Match the exact files implied by the DZI, including all boundary tiles.
async function inspectPyramid(directory) {
  const descriptor = await readFile(join(directory, 'image.dzi'), 'utf8');
  const width = Number(/\bWidth="(\d+)"/.exec(descriptor)?.[1]);
  const height = Number(/\bHeight="(\d+)"/.exec(descriptor)?.[1]);
  if (!(width > 0 && height > 0 && width <= 1e6 && height <= 1e6) ||
      !descriptor.includes(`TileSize="${tileSize}"`) || !descriptor.includes('Format="webp"')) {
    throw new Error('Descripteur DZI invalide.');
  }
  const files = new Set(await collect(directory));
  const expected = ['preview.webp', 'thumb.webp'];
  const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
  for (let level = 0; level <= maxLevel; level++) {
    const span = tileSize * 2 ** (maxLevel - level);
    for (let y = 0; y < Math.ceil(height / span); y++) {
      for (let x = 0; x < Math.ceil(width / span); x++) expected.push(`image_files/${level}/${x}_${y}.webp`);
    }
  }
  expected.push('image.dzi');
  const inventory = new Map();
  for (const file of expected) {
    if (!files.has(file)) throw new Error(`Pyramide incomplète : ${file}`);
    const bytes = await readFile(join(directory, file));
    if (!bytes.length || (file.endsWith('.webp') && (bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length))) {
      throw new Error(`Fichier local invalide : ${file}`);
    }
    inventory.set(file, { size: bytes.length, md5: md5(bytes) });
  }
  return inventory;
}

export async function publish(directory, { verify = false, auditOnly = false } = {}) {
  const key = `${basename(dirname(directory))}/${basename(directory)}`;
  if (!deepZoomKeyPattern.test(key)) throw new Error('Répertoire de pyramide invalide.');
  const files = (await collect(directory)).filter(file => artObjectPattern.test(`${key}/${file}`));
  if (!['image.dzi', 'thumb.webp', 'preview.webp'].every(file => files.includes(file)) || files.length < 4) {
    throw new Error('Pyramide incomplète.');
  }
  const { s3, bucket } = artStorage();
  const marker = { Bucket: bucket, Key: `${key}/image.dzi` };
  const existing = await s3.send(new HeadObjectCommand(marker)).catch(error => {
    if (error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  });
  if (auditOnly && !existing) throw new Error(`Descripteur S3 absent : ${key}.`);
  if (existing && !verify && !auditOnly) return key;
  verify ||= auditOnly;
  const inventory = verify ? await inspectPyramid(directory) : null;
  const remote = new Map();
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: bucket, Prefix: `${key}/` })) {
    for (const object of page.Contents || []) remote.set(object.Key, object);
  }
  function matches(object, file) {
    const expected = inventory?.get(file);
    return expected && object?.Size === expected.size && object?.ETag?.replaceAll('"', '') === expected.md5;
  }
  const upload = async (file) => {
    const bytes = await readFile(join(directory, file));
    const expected = inventory?.get(file);
    if (expected && md5(bytes) !== expected.md5) throw new Error(`Fichier modifié pendant le transfert : ${file}`);
    const stored = await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: `${key}/${file}`, Body: bytes,
      ...(expected && { ContentMD5: Buffer.from(expected.md5, 'hex').toString('base64') }),
      ContentType: artContentType(file), CacheControl: artCacheControl,
    }), { abortSignal: AbortSignal.timeout(120_000) });
    if (expected && stored.ETag?.replaceAll('"', '') !== expected.md5) throw new Error(`Intégrité S3 non confirmée : ${file}`);
  };
  const pending = [];
  for (const file of inventory?.keys() || files) {
    if (file === 'image.dzi') continue;
    const object = remote.get(`${key}/${file}`);
    if (verify ? !matches(object, file) : object?.Size !== (await stat(join(directory, file))).size) pending.push(file);
  }
  if (existing && verify) {
    // Listing may lag behind a successful PUT. Check any disputed entry directly.
    for (const file of pending) {
      const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: `${key}/${file}` }));
      if (!matches({ Size: object.ContentLength, ETag: object.ETag }, file)) throw new Error(`Objet S3 déjà publié mais différent : ${key}/${file}`);
    }
    if (!matches({ Size: existing.ContentLength, ETag: existing.ETag }, 'image.dzi')) {
      throw new Error(`Version S3 déjà publiée mais différente ou incomplète : ${key}. Audit requis avant de modifier ses objets immuables.`);
    }
    console.log(`${key} : version S3 complète, aucun renvoi.`);
    return key;
  }
  console.log(`${key} : ${pending.length} objets à transférer sur ${files.length - 1}`);
  // Upload in bounded batches and publish the descriptor last as the ready marker.
  const parallel = 4;
  for (let offset = 0; offset < pending.length; offset += parallel) {
    let files = pending.slice(offset, offset + parallel);
    for (let retry = 0; files.length > 0; retry++) {
      const results = await Promise.allSettled(files.map(upload));
      const failed = [];
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') continue;
        const error = result.reason;
        const status = error.$metadata?.httpStatusCode;
        const transient = status === 429 || status >= 500 || ['SlowDown', 'Throttling', 'AbortError', 'TimeoutError'].includes(error.name);
        console.error(`S3 ${files[index]} : ${error.name}, HTTP ${status ?? 'sans réponse'}`);
        if (!transient || retry >= 2) throw error;
        failed.push(files[index]);
      }
      files = failed;
      if (files.length) await pause(3_000 * 2 ** retry);
    }
    if ((offset + parallel) % 600 === 0) console.log(`${offset + parallel}/${pending.length} objets`);
    if (offset + parallel < pending.length) await pause(100);
  }
  await upload('image.dzi');
  return key;
}

async function batch(manifest, output) {
  const sources = Object.entries(JSON.parse(await readFile(manifest, 'utf8')));
  const readyPath = resolve(output, 'ready.json');
  const ready = new Map(Object.entries(JSON.parse(await readFile(readyPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{}';
    throw error;
  }))));
  for (const [id, original] of sources) {
    if (typeof original !== 'string') throw new Error(`Chemin de source invalide pour ${id}.`);
    const directory = await prepare(id, original, output);
    const key = await publish(directory);
    ready.set(id, key);
    const pending = `${readyPath}.${process.pid}.tmp`;
    await writeFile(pending, JSON.stringify(Object.fromEntries(ready), null, 2) + '\n');
    await rename(pending, readyPath);
    console.log(key);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'prepare' && args.length === 3) console.log(await prepare(...args));
  else if (command === 'publish' && args.length === 1) console.log(await publish(resolve(args[0])));
  else if (command === 'batch' && args.length === 2) await batch(...args);
  else throw new Error('Usage : node scripts/art-deep-zoom.mjs prepare <id Directus> <original> <sortie> | publish <dossier de pyramide> | batch <sources.json> <sortie>');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
