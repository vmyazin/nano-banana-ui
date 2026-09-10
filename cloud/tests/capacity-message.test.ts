import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adapter } from './database';
import { acceptJob, FREE_BYTES, MAX_ACTIVE_JOBS, VIDEO_RESERVATION } from '../src/jobs';
import { LOCAL_SCHEMA } from '../src/schema';
import type { Env } from '../src/security';
import type { CloudJobRequest } from '../../lib/account/contracts';

let db: DatabaseSync, env: Env;

const video: CloudJobRequest = {
  provider: 'local-test', modelId: 'local-test', mediaType: 'video',
  inputMode: 'text', prompt: 'A canal at dusk', values: {}, referenceIds: [],
};

/**
 * Whatever the account looks like, without going through a real job.
 *
 * Callers derive their figures from the constants and never spell magic bytes:
 * these were once literals calibrated to a 256 MB video reservation, and when
 * that became 96 MB two of the cases below silently started being *accepted*.
 */
function storage(fields: { used?: number; reserved?: number; active?: number }) {
  db.exec(`INSERT OR IGNORE INTO account_storage (user_id) VALUES ('owner')`);
  db.prepare('UPDATE account_storage SET used_bytes=?, reserved_bytes=?, active_jobs=? WHERE user_id=?')
    .run(fields.used ?? 0, fields.reserved ?? 0, fields.active ?? 0, 'owner');
}

const refused = async (token: string) =>
  acceptJob(env, 'owner', token, video).then(
    () => null,
    (error: Error) => error.message
  );

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(LOCAL_SCHEMA);
  db.exec("INSERT INTO account_users (id,google_subject,email,name,created_at) VALUES ('owner','google','t@example.test','Test',1)");
  env = { DB: adapter(db), APP_ORIGIN: 'http://localhost:3097' };
});
afterEach(() => db.close());

/**
 * One sentence covered three unrelated limits, and named only the one the
 * reader could see. The account page's headline figure is `used_bytes`, so
 * "needs more available storage" reads as nonsense to someone with an almost
 * empty library whose reservations are what actually filled the account.
 */
describe('what a refused job says', () => {
  it('names the jobs running when the job slots are what ran out', async () => {
    // Real job rows, because the gate counts live state now. Setting only
    // `active_jobs` used to look like this case and in fact tripped the
    // reservation branch, whose wording matched the same loose regex — a test
    // passing for a reason it did not name.
    storage({ used: 0, reserved: 0, active: 0 });
    for (let i = 0; i < MAX_ACTIVE_JOBS; i += 1) {
      db.prepare(`INSERT INTO account_jobs
        (id,user_id,request_token,request_digest,provider,request_json,state,reservation_bytes,created_at,updated_at)
        VALUES (?,'owner',?,'digest','local-test','{}','running',0,1,1)`).run(`slot-${i}`, `token-${i}`);
    }

    const message = await refused('too-many-active-token');

    expect(message).toMatch(/running|at once|already/i);
    expect(message).not.toMatch(/storage/i);
    // And it no longer sends the reader to dismiss something, which would not
    // free a slot a dismissed job never held.
    expect(message).not.toMatch(/dismiss/i);
  });

  it('lets a job through when the others are stuck rather than running', async () => {
    // The same ten jobs, none of them actually running: the account is not busy,
    // it is waiting on a person.
    storage({ used: 0, reserved: 0, active: 0 });
    for (let i = 0; i < MAX_ACTIVE_JOBS; i += 1) {
      db.prepare(`INSERT INTO account_jobs
        (id,user_id,request_token,request_digest,provider,request_json,state,reservation_bytes,created_at,updated_at)
        VALUES (?,'owner',?,'digest','local-test','{}','needs_attention',0,1,1)`).run(`stuck-${i}`, `stuck-token-${i}`);
    }

    expect(await refused('not-blocked-token')).toBeNull();
  });

  it('blames the reservations when reservations are what filled the account', async () => {
    // Reservations and slots normally move together, so this is the narrow
    // case where the bytes run out first — and the one where the account
    // page misleads hardest, since its headline figure is what is *saved*.
    // One byte too little room for one more video job, whatever a job reserves.
    storage({ used: 0, reserved: FREE_BYTES - VIDEO_RESERVATION + 1, active: 1 });

    const message = await refused('reserved-not-used-token');

    expect(message).toMatch(/in progress|unfinished|holding/i);
    expect(message).not.toMatch(/more available storage/i);
  });

  it('still says storage when storage is genuinely the wall', async () => {
    storage({ used: FREE_BYTES - VIDEO_RESERVATION + 1, reserved: 0, active: 0 });

    expect(await refused('genuinely-full-token')).toMatch(/saved|full/i);
  });

  it('says the reference is missing rather than blaming the account', async () => {
    // A reference that never finished uploading, or that expired, fails the
    // same INSERT — and had nothing to do with storage or job slots.
    storage({ used: 0, reserved: 0, active: 0 });

    const message = await acceptJob(env, 'owner', 'missing-reference-token', {
      ...video, inputMode: 'image', referenceIds: ['upload-that-is-not-ready'],
    }).then(() => null, (error: Error) => error.message);

    expect(message).toMatch(/reference/i);
    expect(message).not.toMatch(/storage/i);
  });
});
