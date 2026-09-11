// Creates the synthetic source used by local edit tests; requires ffmpeg on PATH.
// Run: node scripts/seed-edit-video.mjs
// The checked-in MP4 is also available without ffmpeg. No production media is used.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const path='tests/fixtures/edit-video.mp4';
// Seedance rejects the old 320×180 fixture: source dimensions must be at least
// 300 px, and ByteDance r2v additionally requires 407,696 total pixels.
const result=spawnSync(process.env.FFMPEG_PATH || 'ffmpeg',['-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=12','-t','4','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path],{stdio:'inherit'});
if(result.status!==0)throw new Error('Install ffmpeg to regenerate the checked-in fixture.');
writeFileSync('cloud/src/local-video-fixture.ts',`// Generated test pattern; see scripts/seed-edit-video.mjs. No provider output or user media.\nexport const LOCAL_VIDEO_BASE64 = '${readFileSync(path).toString('base64')}';\n`);
