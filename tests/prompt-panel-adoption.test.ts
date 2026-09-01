import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceFiles = [
  'components/GenerationInterface.tsx',
  'components/FalGenerationWorkspace.tsx',
  'components/KieGenerationWorkspace.tsx',
  'components/ProviderVideoWorkspace.tsx',
] as const;

describe('universal PromptPanel adoption', () => {
  for (const file of workspaceFiles) {
    it(`${file} renders the shared prompt wrapper exactly once`, () => {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      expect(source).toContain("import PromptPanel from '@/components/PromptPanel';");
      expect(source.match(/<PromptPanel(?:\s|>)/g)).toHaveLength(1);
      expect(source.match(/<\/PromptPanel>/g)).toHaveLength(1);
      if (file !== 'components/GenerationInterface.tsx') {
        expect(source).toMatch(/prompt=\{\s*<PromptPanel>/);
      }
    });
  }
});
