import { statfs } from 'node:fs/promises';
import { Agent, request } from 'node:https';
import { setTimeout as pause } from 'node:timers/promises';
import { deepZoomKeyPattern } from './art-media-paths.mjs';

const host = 'art.literae.ch';
const agent = new Agent({ keepAlive: true, maxSockets: 4 });
const budget = Math.floor(2.2 * 1024 ** 3);
const minFree = 1536 * 1024 ** 2;
const warmLevel = 12;
let charged = 0;
let checked = 0;
let hits = 0;
let failures = 0;
let stopReason;

function fromNginx(path, method) {
  return new Promise((resolve, reject) => {
    const req = request({
      agent, hostname: '127.0.0.1', servername: host, headers: { Host: host },
      method, path,
    }, async response => {
      try {
        if (response.statusCode !== 200) {
          response.resume();
          throw new Error(`HTTP ${response.statusCode}`);
        }
        const body = [];
        for await (const chunk of response) body.push(chunk);
        resolve({ headers: response.headers, body: Buffer.concat(body).toString('utf8') });
      } catch (error) {
        reject(error);
      }
    });
    req.setTimeout(25_000, () => req.destroy(new Error('Délai de réponse dépassé')));
    req.once('error', reject);
    req.end();
  });
}

async function charge(response) {
  const bytes = Number(response.headers['content-length']);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Taille de réponse manquante');
  charged += Math.ceil((bytes + 1024) / 4096) * 4096;
  checked++;
  if (response.headers['x-art-cache'] === 'HIT') hits++;
  if (charged >= budget) stopReason = 'budget de préchauffage atteint';
  if (checked % 200 === 1) {
    const { bavail, bsize } = await statfs('/var/cache/nginx');
    if (bavail * bsize < minFree) stopReason = 'espace libre insuffisant';
  }
}

async function warm(paths, method = 'HEAD', consume = () => {}) {
  const pending = paths[Symbol.iterator]();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (!stopReason) {
      const { value: path, done } = pending.next();
      if (done) return;
      try {
        const response = await fromNginx(path, method);
        await charge(response);
        consume(path, response.body);
      } catch (error) {
        failures++;
        if (failures <= 5) console.error(`${path} : ${error.message}`);
        if (failures >= 20) stopReason = 'trop de réponses en erreur';
      }
      await pause(40);
    }
  }));
}

function* tiles(pyramids, level) {
  for (const { path, width, height, maxLevel } of pyramids) {
    if (level > maxLevel) continue;
    const span = 512 * 2 ** (maxLevel - level);
    for (let y = 0; y < Math.ceil(height / span); y++) {
      for (let x = 0; x < Math.ceil(width / span); x++) {
        yield path.replace(/\.dzi$/, `_files/${level}/${x}_${y}.webp`);
      }
    }
  }
}

async function main() {
  const { bavail, bsize } = await statfs('/var/cache/nginx');
  if (bavail * bsize < minFree) {
    console.log('Préchauffage reporté, espace libre insuffisant.');
    return;
  }
  let catalog;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      catalog = JSON.parse((await fromNginx('/oeuvres.json', 'GET')).body).items;
      break;
    } catch (error) {
      if (attempt === 11) throw error;
      await pause(2500);
    }
  }
  const descriptors = new Set(catalog.map(item => item.dzi).filter(path =>
    typeof path === 'string' && path.startsWith('/art-media/') && path.endsWith('/image.dzi') &&
    deepZoomKeyPattern.test(path.slice('/art-media/'.length, -'/image.dzi'.length))));
  if (!descriptors.size) throw new Error('Aucun descripteur dans le catalogue.');

  const pyramids = [];
  await warm(descriptors, 'GET', (path, body) => {
    const width = Number(/\bWidth="(\d+)"/.exec(body)?.[1]);
    const height = Number(/\bHeight="(\d+)"/.exec(body)?.[1]);
    if (!width || !height || !body.includes('TileSize="512"') || !body.includes('Format="webp"')) {
      throw new Error('Descripteur Deep Zoom inattendu');
    }
    pyramids.push({ path, width, height, maxLevel: Math.ceil(Math.log2(Math.max(width, height))) });
  });
  pyramids.sort((a, b) => a.path.localeCompare(b.path));

  for (let level = 0; level < warmLevel && !stopReason; level++) await warm(tiles(pyramids, level));
  await warm(pyramids.flatMap(({ path }) => ['thumb.webp', 'preview.webp']
    .map(file => path.replace(/image\.dzi$/, file))));
  await warm(tiles(pyramids, warmLevel));

  console.log(`${checked} objets traités (${hits} déjà en cache), ${(charged / 1024 ** 3).toFixed(2)} Gio estimés, ${failures} erreurs` +
    (stopReason ? `, ${stopReason}.` : '.'));
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => agent.destroy());
