import { KIE_API, KieApiError } from './client';

const KIE_FILE_API = 'https://kieai.redpandaai.co';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function messageForStatus(status: number, fallback: string): string {
  if (status === 401) return 'Your Kie API key is invalid or has expired.';
  if (status === 402) return 'Your Kie account has insufficient credits.';
  if (status === 429) return 'Kie is rate limiting requests. Please wait and try again.';
  if (status >= 500) return 'Kie is temporarily unavailable. Please try again.';
  const normalized = fallback.toLowerCase();
  if (normalized.includes('api key') || normalized.includes('token')) {
    return 'Your Kie API key is invalid or has expired.';
  }
  if (normalized.includes('credit') || normalized.includes('balance') || normalized.includes('insufficient')) {
    return 'Your Kie account has insufficient credits.';
  }
  if (normalized.includes('content') || normalized.includes('policy') || normalized.includes('safety')) {
    return 'Kie rejected this prompt or reference image under its content policy. Adjust the request and try again.';
  }
  if (normalized.includes('validation') || normalized.includes('parameter') || normalized.includes('invalid input')) {
    return 'Kie rejected one or more model settings. Review the selected controls and try again.';
  }
  return fallback;
}

async function requestKie(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const payload = asRecord(await response.json().catch(() => ({})));
  const code = payload.code;

  if (!response.ok || (typeof code === 'number' && code !== 200)) {
    const message = typeof payload.msg === 'string' ? payload.msg : 'Kie rejected the request.';
    const status = response.ok && typeof code === 'number' ? code : response.status;
    throw new KieApiError(messageForStatus(status, message), status);
  }

  return payload.data;
}

export async function validateKieApiKey(apiKey: string): Promise<{ credits: number | null }> {
  const data = await requestKie(`${KIE_API}/api/v1/chat/credit`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const credits = typeof data === 'number' ? data : null;
  return { credits };
}

export async function uploadKieFile(args: { apiKey: string; file: File }): Promise<string> {
  const form = new FormData();
  form.append('file', args.file, args.file.name);
  form.append('uploadPath', 'images/user-uploads');
  form.append('fileName', args.file.name);

  const data = asRecord(await requestKie(`${KIE_FILE_API}/api/file-stream-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
  }));
  const url = data.downloadUrl ?? data.fileUrl;

  if (typeof url !== 'string' || !url) {
    throw new KieApiError('Kie uploaded the file but did not return a usable URL.', 502);
  }

  return url;
}
