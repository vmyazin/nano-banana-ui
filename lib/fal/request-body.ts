type FalRequest = Pick<Request, 'body' | 'headers' | 'json' | 'formData'>;

export class FalRequestBodyTooLarge extends Error {
  constructor() {
    super('The request body is too large.');
    this.name = 'FalRequestBodyTooLarge';
  }
}

function declaredBodyTooLarge(request: FalRequest, maxBytes: number): boolean {
  const value = request.headers?.get('content-length');
  return value !== null && /^\d+$/.test(value) && Number(value) > maxBytes;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Uint8Array]'
  );
}

async function readBoundedBody(
  request: FalRequest,
  maxBytes: number
): Promise<Uint8Array | undefined> {
  if (declaredBodyTooLarge(request, maxBytes)) throw new FalRequestBodyTooLarge();

  const body = request.body;
  // A few route unit tests use narrow Request doubles. Keep those realm-safe
  // doubles working while every real Request goes through the streaming gate.
  if (body === undefined) return undefined;
  if (body === null) return new Uint8Array();

  const getReader = Reflect.get(body, 'getReader');
  if (typeof getReader !== 'function') throw new TypeError('Unreadable request body');
  const reader = Reflect.apply(getReader, body, []);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let cancelled = false;

  const cancelReader = async () => {
    if (cancelled) return;
    cancelled = true;
    try {
      const cancel = Reflect.get(reader, 'cancel');
      if (typeof cancel === 'function') await Reflect.apply(cancel, reader, []);
    } catch {
      // A stream may already be errored or closed.
    }
  };

  try {
    while (true) {
      const read = Reflect.get(reader, 'read');
      if (typeof read !== 'function') throw new TypeError('Unreadable request body');
      const result = await Reflect.apply(read, reader, []);
      if (result?.done) break;
      const value = result?.value;
      if (!isUint8Array(value)) throw new TypeError('Unreadable request body');

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await cancelReader();
        throw new FalRequestBodyTooLarge();
      }

      const ownedChunk = new Uint8Array(value.byteLength);
      ownedChunk.set(value);
      chunks.push(ownedChunk);
    }
  } catch (error) {
    await cancelReader();
    throw error;
  } finally {
    const releaseLock = Reflect.get(reader, 'releaseLock');
    if (typeof releaseLock === 'function') Reflect.apply(releaseLock, reader, []);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseBoundedFalJson(
  request: FalRequest,
  maxBytes: number
): Promise<unknown> {
  const bytes = await readBoundedBody(request, maxBytes);
  if (bytes === undefined) return request.json();
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function parseBoundedFalFormData(
  request: FalRequest,
  maxBytes: number
): Promise<FormData> {
  const bytes = await readBoundedBody(request, maxBytes);
  if (bytes === undefined) return request.formData();

  const contentType = request.headers?.get('content-type');
  const response = new Response(bytes.buffer as ArrayBuffer, {
    headers: contentType ? { 'Content-Type': contentType } : undefined,
  });
  return response.formData();
}
