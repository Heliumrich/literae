import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { artCacheControl, artContentType, artObjectPattern } from './art-media-paths.mjs';
import { artStorage } from './art-storage.mjs';

const { s3, bucket } = artStorage();
const port = Number(process.env.ART_MEDIA_PORT || 4392);
let active = 0;

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const prefix = '/art-media/';
  const key = req.url?.startsWith(prefix) ? req.url.slice(prefix.length).split('?')[0] : '';
  if (!artObjectPattern.test(key)) { res.writeHead(404).end(); return; }
  if (active >= 64) { res.writeHead(503, { 'Retry-After': '1' }).end(); return; }

  const client = new AbortController();
  res.once('close', () => client.abort());
  const signal = AbortSignal.any([client.signal, AbortSignal.timeout(20_000)]);
  active++;
  try {
    const command = req.method === 'HEAD' ? HeadObjectCommand : GetObjectCommand;
    const object = await s3.send(new command({ Bucket: bucket, Key: key }), { abortSignal: signal });
    res.setHeader('Content-Type', artContentType(key));
    res.setHeader('Cache-Control', artCacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (object.ContentLength !== undefined) res.setHeader('Content-Length', object.ContentLength);
    if (object.ETag) res.setHeader('ETag', object.ETag);
    if (req.method === 'HEAD') res.end();
    else await pipeline(object.Body, res, { signal });
  } catch (error) {
    if (client.signal.aborted) return;
    if (res.headersSent) { res.destroy(); return; }
    res.removeHeader('Content-Length');
    res.setHeader('Cache-Control', 'no-store');
    const missing = error.$metadata?.httpStatusCode === 404;
    if (!missing) console.error('Lecture S3 impossible', error.name, error.$metadata?.httpStatusCode);
    res.writeHead(missing ? 404 : 502).end();
  } finally {
    active--;
  }
}).listen(port, '127.0.0.1', () => console.log(`Médias de la galerie sur http://127.0.0.1:${port}/art-media/`));
