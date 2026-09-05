/** Local-only, deterministic account smoke fixture. Never uses production data. */
const origin = process.env.ACCOUNT_DEMO_ORIGIN || 'http://localhost:3097';
const target = new URL(origin);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('This fixture only runs against localhost.');
const login = await fetch(`${origin}/api/account/local-sign-in`, { method: 'POST', headers: { Origin: origin } });
if (!login.ok) throw new Error('Local account sign-in failed.');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };
const response = await fetch(`${origin}/api/account/jobs`, { method: 'POST', headers, body: JSON.stringify({ token: 'account-demo-local-image-v1', request: { provider: 'local-test', modelId: 'local-test', mediaType: 'image', inputMode: 'text', prompt: 'Local account smoke-test image', values: {}, referenceIds: [] } }) });
const payload = await response.json();
if (!response.ok) throw new Error(payload.error || 'Could not queue local job.');
console.log('Local job accepted.');
for (let attempt = 0; attempt < 20; attempt++) {
  const result = await fetch(`${origin}/api/account/jobs/${payload.job.id}`, { headers });
  const { job } = await result.json();
  if (job.state === 'saved') {
    const library = await fetch(`${origin}/api/account/assets`, { headers });
    const { assets } = await library.json();
    const asset = assets.find(asset => asset.jobId === job.id);
    if (!asset) throw new Error('Saved job is missing its asset.');
    const download = await fetch(`${origin}/api/account/assets/${asset.id}/content`, { headers });
    const bytes = (await download.arrayBuffer()).byteLength;
    if (!download.ok || bytes !== asset.bytes) throw new Error('Asset download failed verification.');
    console.log(`Local Workflow saved ${bytes} bytes to R2; authenticated download verified.`);
    process.exit(0);
  }
  if (['failed', 'needs_attention'].includes(job.state)) throw new Error(`Local job needs attention: ${job.errorCode}`);
  await new Promise(resolve => setTimeout(resolve, 500));
}
throw new Error('Local workflow did not complete in time.');
