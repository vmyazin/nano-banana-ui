/** Application bounds for the first editing release, not vendor storage quotas. */
export const MAX_EDIT_VIDEO_BYTES = 100_000_000;
export const EDIT_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export function isEditVideoMime(mime: string): boolean {
  return (EDIT_VIDEO_MIMES as readonly string[]).includes(mime);
}
export function validateEditVideo(file: Pick<File, 'size' | 'type'>): void {
  if (!isEditVideoMime(file.type) || file.size <= 0 || file.size > MAX_EDIT_VIDEO_BYTES) {
    throw new Error('Choose an MP4, MOV or WebM video up to 100 MB.');
  }
}
export const EDIT_PROMPTS = {
  'Replace character': 'Edit @Video1: replace the main person with the character in @Image1. Keep their movement, timing, camera framing, and background unchanged.',
  'Change scene': 'Edit @Video1: replace the background with a snowy forest. Keep the person, clothing, movement, timing, and camera framing unchanged.',
  Restyle: 'Edit @Video1: restyle the clip as a clay animation. Preserve the subjects, composition, movement, camera, and timing.',
};
