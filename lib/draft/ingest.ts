import { convertImageFile } from '@/lib/image/convert';
import {
  DEFAULT_QUALITY,
  targetFormat,
  type ImageFormatPreference,
} from '@/lib/image/policy';
import type { DraftReferenceInput } from '@/store/useDraftStore';

/**
 * The one place reference images are re-encoded before a provider sees them.
 *
 * Nano Banana and every Gemini path return PNG, which is both the largest thing
 * we could upload and the format providers handle worst. Converting here — in
 * front of `useDraftStore.addReferences` — covers every provider at once,
 * because they all read `DraftReference.file`.
 *
 * Deliberately *not* inside `addReferences`, which stays synchronous. Inserting
 * the reference first and swapping the file in when conversion resolves (the
 * pattern `measureImageUrl` uses for dimensions) leaves a window where hitting
 * Generate ships the original PNG anyway — exactly the bug this exists to fix.
 */
export async function prepareReferences(
  entries: DraftReferenceInput[],
  preference: ImageFormatPreference
): Promise<DraftReferenceInput[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const format = targetFormat({
        sourceMime: entry.file.type,
        destination: 'reference',
        preference,
      });
      if (!format) return entry;

      // convertImageFile returns the original on every failure path, so a
      // reference that will not convert still reaches the provider.
      return { ...entry, file: await convertImageFile(entry.file, format, DEFAULT_QUALITY) };
    })
  );
}
