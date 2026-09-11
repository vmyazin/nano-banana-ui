/** Local-only edit-video setup. Uses a generated test pattern and a fake provider key. */
import {readFileSync} from 'node:fs';
const origin=process.env.ACCOUNT_DEMO_ORIGIN||'http://localhost:3151';
const target=new URL(origin);
if(target.protocol!=='http:'||!['localhost','127.0.0.1'].includes(target.hostname))throw new Error('Localhost only.');
const login=await fetch(`${origin}/api/account/local-sign-in`,{method:'POST',headers:{Origin:origin}});
if(!login.ok)throw new Error('Start the local dev server first.');
const headers={Origin:origin,Cookie:login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),'Content-Type':'application/json'};
async function post(path,body){const response=await fetch(`${origin}/api/account/${path}`,{method:'POST',headers,body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
await post('connections',{provider:'runware',apiKey:'local-fake-runware-key',ifAbsent:true});
const file=readFileSync(new URL('../tests/fixtures/edit-video.mp4',import.meta.url));
const imported=await post('imports',{clientImportId:'edit-video-source-fixture-v1',bytes:file.length,mimeType:'video/mp4',metadata:{provider:'local-test',modelId:'local-fixture',mediaType:'video',inputMode:'text',prompt:'Synthetic editing source — moving test pattern',values:{},referenceIds:[]}});
if(imported.state!=='completed'){
 const response=await fetch(imported.url,{method:'PUT',headers:{Origin:origin,'Content-Type':'video/mp4'},body:file});
 if(!response.ok)throw new Error('Could not store local video fixture.');
}
console.log('Local edit account ready. Sign in with Use local test account, select Runware, then Edit video. DEV_FAKE_GENERATION=1 must be set for credential-free generation.');
