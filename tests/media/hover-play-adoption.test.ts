import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hover-to-preview, the opening-frame seek, viewport-gated loading and
 * `playsInline` are all properties of `VideoPlayer` now, so the rule is no
 * longer "spread the hook on every `<video>`" but "go through the player".
 *
 * Stated as an invariant rather than as a list of files, which is the point of
 * the rewrite: the old version named seven components by hand, so a new surface
 * that forgot the rule passed by simply not being on the list.
 *
 * `TimelinePreview` is the one exception, and it earns it: two elements driven
 * by one clock across a cut cannot be owned by a component that holds a single
 * element and its own time, so it keeps its slots and renders only the shared
 * `Transport` over them.
 *
 * Matched over whole file contents rather than with a line-based grep, because
 * the elements in `TimelinePreview` are written across several lines — and a
 * new component doing the same would otherwise slip past this test.
 *
 * Comments are stripped first. Several files in this repo discuss the element
 * in prose (`GalleryGrid`, `TimelineClipDrawer`, and `Transport`'s own header
 * all mention `<video>`), and matching those would report three violations that
 * do not exist.
 */
const ALLOWED = ['components/video/VideoPlayer.tsx', 'components/TimelinePreview.tsx'];

const ROOTS = ['components', 'app'];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const ELEMENT = /<video[\s>]/;

/** Block and line comments, so prose about the element is not read as one. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function filesRenderingBareVideo(): string[] {
  return ROOTS.flatMap(tsxFiles).filter((file) =>
    ELEMENT.test(stripComments(readFileSync(join(process.cwd(), file), 'utf8')))
  );
}

describe('video element adoption', () => {
  it('renders no bare <video> outside the player and the timeline preview', () => {
    expect(filesRenderingBareVideo().filter((file) => !ALLOWED.includes(file))).toEqual([]);
  });

  it('still finds both files that are allowed one, so the query is not vacuous', () => {
    // Without this, a matcher that silently found nothing would make the test
    // above pass forever.
    expect(filesRenderingBareVideo().sort()).toEqual([...ALLOWED].sort());
  });
});
