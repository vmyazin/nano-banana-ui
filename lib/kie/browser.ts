import type { KieInputMode, KieJob, KieProtocol, KieTask, MediaType } from './types';

interface KieRouteResponse {
  success?: boolean;
  error?: string;
  taskId?: string;
  protocol?: KieProtocol;
  task?: KieTask;
  url?: string;
}

async function parseKieResponse(response: Response): Promise<KieRouteResponse> {
  const data = (await response.json()) as KieRouteResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Kie could not complete that request. Please try again.');
  }
  return data;
}

export async function uploadKieFiles(apiKey: string, files: File[]): Promise<string[]> {
  return Promise.all(
    files.map(async (file) => {
      const form = new FormData();
      form.set('apiKey', apiKey);
      form.set('file', file);
      const data = await parseKieResponse(
        await fetch('/api/kie/upload', { method: 'POST', body: form })
      );
      if (!data.url) throw new Error('Kie did not return a temporary file URL.');
      return data.url;
    })
  );
}

export async function submitKieJob(args: {
  apiKey: string;
  modelId: string;
  mediaType: MediaType;
  inputMode: KieInputMode;
  prompt: string;
  uploadUrls: string[];
  values: Record<string, string | number | boolean>;
}): Promise<Pick<KieJob, 'taskId' | 'protocol'>> {
  const data = await parseKieResponse(
    await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'kie', operation: 'submit', ...args }),
    })
  );
  if (!data.taskId || !data.protocol) throw new Error('Kie did not return a task ID.');
  return { taskId: data.taskId, protocol: data.protocol };
}

export async function getKieJobStatus(args: {
  apiKey: string;
  taskId: string;
  protocol: KieProtocol;
}): Promise<KieTask> {
  const data = await parseKieResponse(
    await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'kie', operation: 'status', ...args }),
    })
  );
  if (!data.task) throw new Error('Kie did not return the task status.');
  return data.task;
}
