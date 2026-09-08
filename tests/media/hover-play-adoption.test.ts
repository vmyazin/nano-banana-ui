import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every clip a viewer can rest a pointer on previews the same way. The timeline
 * preview is the one exception: its two slots are driven by the playhead, and a
 * hover starting one of them would fight the scrubber.
 */
const files = [
  'components/GalleryGrid.tsx',
  'components/FalGenerationWorkspace.tsx',
  'components/KieGenerationWorkspace.tsx',
  'components/ProviderVideoWorkspace.tsx',
  'components/account/CloudJobPanel.tsx',
  'components/account/CloudAssetGrid.tsx',
  'components/account/BrowserImportDialog.tsx',
] as const;

describe('hover-to-play adoption', () => {
  for (const file of files) {
    it(`${file} spreads useHoverPlay on every <video>`, () => {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      expect(source).toContain("import { useHoverPlay } from '@/lib/media/use-hover-play';");
      // `<video\s` so a doc comment naming the element is not counted as one.
      const videos = source.match(/<video\s[^>]*>/gs) ?? [];
      expect(videos.length).toBeGreaterThan(0);
      for (const video of videos) expect(video).toMatch(/\{\.\.\.hoverPlay\}/);
    });
  }
});
