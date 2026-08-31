import { convertImageBlob } from '@/lib/image/convert';
import {
  DEFAULT_QUALITY,
  targetFormat,
  type ImageFormatPreference,
} from '@/lib/image/policy';

/**
 * The bytes a download should actually write to disk.
 *
 * Split out from the two download call sites so both agree, and so neither has
 * to know the policy. The returned blob's own `type` is what every caller must
 * name the file after — `convertImageBlob` returns the original whenever the
 * conversion could not happen, and a `.webp` name over PNG bytes is worse than
 * no conversion at all.
 */
export function convertedForDownload(
  blob: Blob,
  preference: ImageFormatPreference
): Promise<Blob> {
  const format = targetFormat({
    sourceMime: blob.type,
    destination: 'download',
    preference,
  });
  return format ? convertImageBlob(blob, format, DEFAULT_QUALITY) : Promise.resolve(blob);
}
