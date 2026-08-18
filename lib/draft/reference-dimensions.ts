/**
 * Reads the natural pixel size of a reference image off its object URL.
 *
 * Resolves null instead of rejecting: a reference whose size cannot be read
 * (unsupported codec, test environment without image decoding) simply never
 * gets dimensions, and every consumer of `DraftReference.width/height` treats
 * their absence as "nothing to match against".
 */
export function measureImageUrl(url: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const { naturalWidth, naturalHeight } = image;
      resolve(naturalWidth > 0 && naturalHeight > 0 ? { width: naturalWidth, height: naturalHeight } : null);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
