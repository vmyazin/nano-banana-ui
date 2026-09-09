/** Local-only export reproduction: four seconds of color bars and a 440 Hz tone. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.EXPORT_FIXTURE_ORIGIN || 'http://localhost:3141';
const target = new URL(origin);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
  throw new Error('This fixture only runs against localhost.');
}
const path = join(mkdtempSync(join(tmpdir(), 'scene-export-audio-')), 'four-second-tone.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
  'testsrc2=size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', path]);
const fixture = readFileSync(path);
const login = await fetch(`${origin}/api/account/local-sign-in`, { method: 'POST', headers: { Origin: origin } });
if (!login.ok) throw new Error('Local account sign-in failed.');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };
const begin = await fetch(`${origin}/api/account/imports`, { method: 'POST', headers,
  body: JSON.stringify({ clientImportId: 'export-audio-tone-4s-v1', bytes: fixture.length,
    mimeType: 'video/mp4', metadata: { provider: 'local-test', modelId: 'export-audio-fixture',
      mediaType: 'video', inputMode: 'text', prompt: 'Export audio endpoint — 4s tone', values: {}, referenceIds: [] } }) });
let result = await begin.json();
if (!begin.ok) throw new Error('Local import reservation failed.');
if (result.state !== 'completed') {
  const transferTarget = new URL(result.url);
  if (!['localhost', '127.0.0.1'].includes(transferTarget.hostname)) throw new Error('Non-local transfer refused.');
  const transfer = await fetch(result.url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'video/mp4' }, body: fixture });
  result = await transfer.json();
  if (!transfer.ok || result.state !== 'completed') throw new Error('Local import failed.');
}
console.log(JSON.stringify({ inputFile: path, assetId: result.assetId, reviewUrl: `${origin}/account` }));
