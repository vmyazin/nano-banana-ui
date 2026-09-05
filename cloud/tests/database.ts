import { DatabaseSync } from 'node:sqlite';
export function adapter(db: DatabaseSync) {
  let pending = Promise.resolve<unknown>(undefined);
  function prepare(query: string) {
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) { values = args; return this; },
      async run() { const result = db.prepare(query).run(...values as []); return { success: true, meta: { changes: Number(result.changes) } }; },
      async all() { return { success: true, results: db.prepare(query).all(...values as []) }; },
      async first() { return db.prepare(query).get(...values as []) ?? null; },
    };
  }
  return { prepare, async batch(statements: { run(): Promise<unknown> }[]) {
    const next = pending.then(async () => {
      db.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    });
    pending = next.catch(() => undefined);
    return next;
  } } as unknown as D1Database;
}
