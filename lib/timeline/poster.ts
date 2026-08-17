/**
 * Which blob can stand in as a still for a clip.
 *
 * A record carries two: `posterBlob`, an extracted frame, and `blob`, the video
 * itself. Only the first is an image. The fallback to the video blob predates
 * this and is never renderable — an `<img>` handed an `video/mp4` source stays
 * 0x0 — so it showed an empty box instead of the "No preview" the layouts
 * already have. That window is real: a clip added a moment ago is on screen
 * before its record (and its poster) comes back from IndexedDB.
 */
export function posterImage(...candidates: Array<Blob | undefined>): Blob | undefined {
  return candidates.find((blob) => blob?.type.startsWith('image/'));
}
