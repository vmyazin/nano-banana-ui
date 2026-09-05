import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOUD_PROVIDERS, enabledProviders } from '../src/providers';
import type { Env } from '../src/security';

// Reading the deployed configuration is the point: a provider added to the union
// but forgotten in wrangler.jsonc reaches production as the same "not available"
// message this test exists to prevent.
function productionVars(): Record<string,string> {
  const source = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')).vars;
}

// The real production origin keeps isLocal false, so these assertions describe the
// deployed path rather than the local fixture branch.
const vars = productionVars();
const base = { APP_ORIGIN: vars.APP_ORIGIN } as Env;

describe('production generation provider configuration', () => {
  it('enables every background-capable provider', () => {
    const env = { ...base, CLOUD_GENERATION_PROVIDERS: vars.CLOUD_GENERATION_PROVIDERS };
    expect(enabledProviders(env).sort()).toEqual([...CLOUD_PROVIDERS].sort());
  });
  it('accepts only the providers a value names, ignoring unknown and empty entries', () => {
    expect(enabledProviders({ ...base, CLOUD_GENERATION_PROVIDERS: ' fal , , nope, gemini ' })).toEqual(['fal','gemini']);
    expect(enabledProviders(base)).toEqual([]);
    // The local fixture is never a deployable provider, only an isLocal branch.
    expect(enabledProviders({ ...base, CLOUD_GENERATION_PROVIDERS: 'local-test' })).toEqual([]);
  });
});
