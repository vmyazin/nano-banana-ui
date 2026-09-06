/**
 * Local-only browser-library fixture for the account import picker.
 *
 * Paste this into DevTools on http://localhost:3097 and reload. It cannot be a
 * Node script like `seed-account-demo.mjs`: that one seeds the *cloud* side over
 * HTTP, while the import picker reads this browser's IndexedDB, which is scoped
 * to one origin in one browser profile and is unreachable from outside the page.
 *
 * Everything it writes is generated here — canvas gradients and, where the
 * browser supports it, short MediaRecorder clips — so the fixture is real bytes
 * of real MIME types travelling the real import path, without a vendor account
 * or a single byte of anyone's actual work.
 *
 * Deterministic: the same slugs, providers and ids every run, so re-running
 * replaces the fixture instead of piling up duplicates.
 *
 * Undo:  await seedBrowserGallery.clear()
 */
(() => {
  const DATABASE_NAME = 'scene-assembly-gallery';
  const DATABASE_VERSION = 1;
  const STORE_NAME = 'results';
  const PREFIX = 'seed-';

  if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('This fixture only runs against localhost.');
  }

  /** Real engine ids from lib/engines/registry.ts. */
  const IMAGES = [
    ['espresso-cup-walnut', 'gemini', ['#0f766e', '#facc15']],
    ['headphones-teal-sweep', 'kie', ['#0891b2', '#0b1120']],
    ['lighthouse-keeper-35mm', 'runware', ['#334155', '#f8fafc']],
    ['cyanotype-fern', 'cloudflare', ['#1e3a8a', '#67e8f9']],
    ['studio-portrait-v4', 'gemini', ['#7c2d12', '#fed7aa']],
    ['matte-black-render', 'atlas', ['#171717', '#a3a3a3']],
    ['neon-alley-wide', 'comet', ['#4c1d95', '#f0abfc']],
    ['ferns-blueprint-02', 'gemini', ['#064e3b', '#a7f3d0']],
    ['harbour-fog-plate', 'fal', ['#312e81', '#c7d2fe']],
    ['brass-lamp-still', 'pollinations', ['#78350f', '#fde68a']],
  ];
  const VIDEOS = [
    ['arcade-dolly-4s', 'fal', ['#7e22ce', '#22d3ee']],
    ['skylight-rain-push', 'kie', ['#0c4a6e', '#e0f2fe']],
  ];

  function paint(ctx, width, height, [from, to], phase) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = to;
    ctx.beginPath();
    ctx.arc(width * (0.3 + 0.4 * phase), height * 0.45, Math.min(width, height) * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  function imageBlob(colors, edge) {
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = Math.round(edge * 0.75);
    paint(canvas.getContext('2d'), canvas.width, canvas.height, colors, 0.5);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  /** Null when the browser has no MediaRecorder; the fixture then stays images-only. */
  async function videoBlob(colors) {
    if (typeof MediaRecorder === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(12);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    } catch {
      return null;
    }
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    for (let frame = 0; frame < 12; frame += 1) {
      paint(ctx, canvas.width, canvas.height, colors, frame / 12);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    recorder.stop();
    stream.getTracks().forEach(track => track.stop());
    await done;
    // Re-wrapped so the type is exactly video/webm: MediaRecorder reports
    // "video/webm;codecs=vp8", which isImportableGalleryRecord does not accept.
    return chunks.length ? new Blob(chunks, { type: 'video/webm' }) : null;
  }

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function write(database, record) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function record(slug, provider, kind, blob, index) {
    return {
      id: `${PREFIX}${slug}`,
      kind,
      createdAt: Date.now() - index * 300_000,
      prompt: slug.replaceAll('-', ' '),
      slug,
      provider,
      modelId: `${provider}-fixture`,
      inputMode: 'text',
      controlValues: { aspectRatio: '4:3' },
      mimeType: blob.type,
      blob,
      bytes: blob.size,
      kept: true,
    };
  }

  async function seed() {
    const database = await open();
    let index = 0;
    let images = 0;
    let videos = 0;
    for (const [slug, provider, colors] of IMAGES) {
      const blob = await imageBlob(colors, 240 + (index % 5) * 120);
      await write(database, record(slug, provider, 'image', blob, index));
      index += 1;
      images += 1;
    }
    for (const [slug, provider, colors] of VIDEOS) {
      const blob = await videoBlob(colors);
      if (!blob) continue;
      await write(database, record(slug, provider, 'video', blob, index));
      index += 1;
      videos += 1;
    }
    database.close();
    console.log(`Seeded ${images} image${images === 1 ? '' : 's'} and ${videos} video${videos === 1 ? '' : 's'}. Reload to pick them up.`);
    return { images, videos };
  }

  async function clear() {
    const database = await open();
    const removed = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const keys = store.getAllKeys();
      let count = 0;
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (typeof key === 'string' && key.startsWith(PREFIX)) {
            store.delete(key);
            count += 1;
          }
        }
      };
      transaction.oncomplete = () => resolve(count);
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    console.log(`Removed ${removed} seeded record${removed === 1 ? '' : 's'}. Reload to pick it up.`);
    return removed;
  }

  globalThis.seedBrowserGallery = { seed, clear };
  return seed();
})();
