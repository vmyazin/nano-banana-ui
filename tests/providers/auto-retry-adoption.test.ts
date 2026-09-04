import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every workspace that can start a generation retries a transient failure the
 * same way — all models, all providers. A workspace that grows its own retry,
 * or none at all, is the drift this guard catches.
 */
const workspaceFiles = [
  'components/GenerationInterface.tsx',
  'components/FalGenerationWorkspace.tsx',
  'components/KieGenerationWorkspace.tsx',
  'components/ProviderVideoWorkspace.tsx',
] as const;

describe('shared automatic retry adoption', () => {
  for (const file of workspaceFiles) {
    it(`${file} retries through the shared countdown`, () => {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');

      expect(source).toMatch(/from '@\/lib\/providers\/auto-retry'/);
      expect(source.match(/useAutoRetry\(\)/g)).toHaveLength(1);
      // Scheduled only behind the retryable-failure gate, never on every failure.
      expect(source).toMatch(/isRetryableFailure\([^)]*\)\s*(&&|\))/);
      // The budget starts over on a deliberate press and on a run that worked.
      expect(source.match(/autoRetry\.reset\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
      // And the countdown is always cancellable.
      expect(source).toMatch(/onCancel(Retry)?=\{autoRetry\.cancel\}/);
    });
  }
});
