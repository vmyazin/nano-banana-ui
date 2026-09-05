/** Profile images come from Google's verified identity, never arbitrary image hosts. */
export function googleProfilePicture(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
      ? url.href : null;
  } catch { return null; }
}
