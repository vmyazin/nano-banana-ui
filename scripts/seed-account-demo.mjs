/** Local-only, deterministic account smoke fixture. Never uses production data. */
const origin = process.env.ACCOUNT_DEMO_ORIGIN || 'http://localhost:3097';
const target = new URL(origin);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('This fixture only runs against localhost.');
const login = await fetch(`${origin}/api/account/local-sign-in`, { method: 'POST', headers: { Origin: origin } });
if (!login.ok) throw new Error('Local account sign-in failed.');
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' };
// Exercise real local multipart staging without a vendor account.
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const reserved = await fetch(`${origin}/api/account/uploads`, {method:'POST', headers, body:JSON.stringify({bytes:fixture.length,mimeType:'image/png'})});
const upload = await reserved.json();
if(!reserved.ok)throw new Error('Local reference reservation failed.');
const uploaded = await fetch(upload.url, {method:'PUT',headers:{Origin:origin,'Content-Type':'image/png'},body:fixture});
if(!uploaded.ok)throw new Error('Local reference staging failed.');
const removed = await fetch(`${origin}/api/account/uploads/${upload.id}`,{method:'DELETE',headers});
if(!removed.ok)throw new Error('Local reference cleanup failed.');
console.log('Direct reference staging and cleanup verified.');
const response = await fetch(`${origin}/api/account/jobs`, { method: 'POST', headers, body: JSON.stringify({ token: 'account-demo-local-image-v1', request: { provider: 'local-test', modelId: 'local-test', mediaType: 'image', inputMode: 'text', prompt: 'Local account smoke-test image', values: {}, referenceIds: [] } }) });
const payload = await response.json();
if (!response.ok) throw new Error(payload.error || 'Could not queue local job.');
console.log('Local job accepted.');
const completionDeadline = Date.now() + 90_000;
let latestJobState = 'unknown';
while (Date.now() < completionDeadline) {
  const result = await fetch(`${origin}/api/account/jobs/${payload.job.id}`, { headers });
  const { job } = await result.json();
  latestJobState = job.state;
  if (job.state === 'saved') {
    const library = await fetch(`${origin}/api/account/assets`, { headers });
    const { assets } = await library.json();
    const asset = assets.find(asset => asset.jobId === job.id);
    if (!asset) throw new Error('Saved job is missing its asset.');
    const download = await fetch(`${origin}/api/account/assets/${asset.id}/content`, { headers });
    const bytes = (await download.arrayBuffer()).byteLength;
    if (!download.ok || bytes !== asset.bytes) throw new Error('Asset download failed verification.');
    const accessResponse=await fetch(`${origin}/api/account/assets/${asset.id}/access`,{method:'POST',headers});
    const access=await accessResponse.json();
    const range=await fetch(access.url,{headers:{Range:'bytes=0-9'}});
    if(range.status!==206 || (await range.arrayBuffer()).byteLength!==10)throw new Error('Scoped range download failed.');
    console.log(`Local Workflow saved ${bytes} bytes to R2; authenticated download verified.`);
    process.exit(0);
  }
  if (['failed', 'needs_attention', 'cancelled'].includes(job.state)) throw new Error(`Local job needs attention: ${job.errorCode}`);
  await new Promise(resolve => setTimeout(resolve, 500));
}
throw new Error(`Local workflow did not complete before the deadline (job ${payload.job.id}, latest state ${latestJobState}). Rerunning reuses the same job instead of creating a new generation.`);
