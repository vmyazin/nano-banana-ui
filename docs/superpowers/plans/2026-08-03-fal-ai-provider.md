# fal.ai Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fal.ai BYOK generation to all six image modes and both video modes with Nano Banana 2 plus a curated nine-choice video catalog.

**Architecture:** Keep the Kie implementation intact and add a fal-specific typed catalog, per-request server client, allow-listed queue routes, browser transport, and tab-local job store. Reuse only neutral model-control and provider-selection UI; all long inference runs through fal's durable queue while Next.js handles short authenticated calls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand, TanStack Query, Vitest/React Testing Library, `@fal-ai/client@1.10.1`

**Design:** `docs/superpowers/specs/2026-08-03-fal-ai-provider-design.md`

**Primary fal references:** [Nano Banana 2](https://fal.ai/docs/model-api-reference/image-generation-api/nano-banana-2), [async queue](https://fal.ai/docs/documentation/model-apis/inference/queue), [fal CDN](https://fal.ai/docs/documentation/model-apis/fal-cdn), [pricing validation](https://fal.ai/docs/platform-apis/v1/models/pricing)

**Execution prerequisite:** Start implementation in a dedicated git worktree, then follow the tasks in order. Do not modify or commit the pre-existing untracked dependency-longevity documents.

---

## File map

**Create**

- `lib/fal/types.ts` — fal catalog, task, and job types.
- `lib/fal/catalog.ts` — the only source of allowed fal endpoint IDs, verified controls, defaults, request mapping, validation, and result extraction.
- `lib/fal/server.ts` — per-request fal clients, key validation, uploads, queue operations, and sanitized errors.
- `lib/fal/browser.ts` — browser-to-Next.js transport and the image queue runner.
- `lib/fal/queue.ts` — polling delays, timeout, and terminal-state helpers.
- `store/useFalJobsStore.ts` — non-persisted fal video jobs.
- `app/api/fal/validate/route.ts` — non-billable key validation.
- `app/api/fal/upload/route.ts` — authenticated fal CDN uploads.
- `app/api/fal/queue/route.ts` — allow-listed submit/status/cancel operations.
- `components/ModelControls.tsx` — provider-neutral rendering for typed model fields.
- `components/ProviderSelector.tsx` — small reusable Kie/fal pill selector.
- `components/FalJobsProvider.tsx` — bounded polling for tab-local fal jobs.
- `components/FalGenerationWorkspace.tsx` — searchable fal video workspace.
- `tests/fal/catalog.test.ts`, `tests/fal/provider-state.test.ts`, `tests/fal/server.test.ts`, `tests/fal/routes.test.ts`, `tests/fal/browser.test.ts`, `tests/fal/queue.test.ts`, `tests/fal/api-key-config.test.tsx`, `tests/fal/jobs-provider.test.tsx`, `tests/fal/workspace.test.tsx`, `tests/model-controls.test.tsx`, `tests/video-workspace.test.tsx`.

**Modify**

- `package.json`, `pnpm-lock.yaml` — add the official fal client.
- `lib/engines/registry.ts` — add the `fal` image engine and its capabilities.
- `store/useAppStore.ts` — persist the fal key, selected video provider, and fal video choice.
- `components/ApiKeyConfig.tsx` — fal key connection/validation UI.
- `components/GenerationInterface.tsx` — route fal image work through the browser-side queue runner.
- `components/KieGenerationWorkspace.tsx` — use the neutral model-control renderer only; do not change Kie transport or catalog behavior.
- `components/VideoWorkspace.tsx` — select Kie or fal and render the matching workspace.
- `app/providers.tsx` — mount fal polling beside Kie polling.
- `app/page.tsx` — count fal credentials in the connected-key header state.
- `tests/generation-interface.test.tsx`, `tests/kie/workspace.test.tsx` — preserve existing behavior while covering fal.
- `README.md` — provider matrix, setup, usage, model catalog, architecture, privacy, and docs.

---

### Task 1: Add the typed, allow-listed fal catalog

**Files:**

- Create: `lib/fal/types.ts`
- Create: `lib/fal/catalog.ts`
- Create: `tests/fal/catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/fal/catalog.test.ts` with concrete coverage for the image pair, all nine video choices, all 18 video endpoints, input filtering, and result extraction:

```ts
import { describe, expect, it } from 'vitest';
import {
  FAL_IMAGE_MODEL,
  FAL_VIDEO_MODELS,
  buildFalInput,
  defaultFalValues,
  extractFalResult,
  modelsForFalMode,
  resolveFalVariant,
  validateFalInput,
} from '../../lib/fal/catalog';

describe('fal model catalog', () => {
  it('contains Nano Banana 2 plus nine curated video choices', () => {
    expect(FAL_IMAGE_MODEL.id).toBe('nano-banana-2');
    expect(FAL_VIDEO_MODELS.map((model) => model.id)).toEqual([
      'veo-3-1', 'veo-3-1-fast',
      'seedance-2', 'seedance-2-fast',
      'kling-3-standard', 'kling-3-pro',
      'sora-2', 'sora-2-pro', 'wan-2-7',
    ]);
    expect(FAL_VIDEO_MODELS.flatMap((model) => model.variants)).toHaveLength(18);
  });

  it('maps Nano Banana text and edit inputs exactly', () => {
    const text = resolveFalVariant('nano-banana-2', 'image', 'text');
    const edit = resolveFalVariant('nano-banana-2', 'image', 'image');
    expect(text.endpointId).toBe('fal-ai/nano-banana-2');
    expect(edit.endpointId).toBe('fal-ai/nano-banana-2/edit');
    expect(buildFalInput(edit, {
      prompt: 'Combine these references',
      uploadUrls: ['https://v3.fal.media/a.png', 'https://v3.fal.media/b.png'],
      values: { aspect_ratio: '16:9', resolution: '2K', enable_web_search: true, ignored: 'no' },
    })).toEqual({
      prompt: 'Combine these references',
      image_urls: ['https://v3.fal.media/a.png', 'https://v3.fal.media/b.png'],
      aspect_ratio: '16:9',
      resolution: '2K',
      enable_web_search: true,
    });
  });

  it('exposes only compatible video variants and their defaults', () => {
    expect(modelsForFalMode('video', 'image')).toHaveLength(9);
    const variant = resolveFalVariant('veo-3-1-fast', 'video', 'image');
    expect(variant.endpointId).toBe('fal-ai/veo3.1/fast/image-to-video');
    expect(defaultFalValues(variant)).toMatchObject({
      aspect_ratio: 'auto', duration: '8s', resolution: '720p', generate_audio: true,
    });
  });

  it('rejects missing and excessive references', () => {
    const edit = resolveFalVariant('nano-banana-2', 'image', 'image');
    expect(validateFalInput(edit, { prompt: 'Edit', uploadUrls: [] })).toMatch(/at least one/i);
    expect(validateFalInput(edit, {
      prompt: 'Edit', uploadUrls: Array.from({ length: 15 }, (_, index) => `https://x/${index}.png`),
    })).toMatch(/up to 14/i);
  });

  it('extracts normalized image and video results', () => {
    expect(extractFalResult('image', { images: [{ url: 'https://fal/image.png', content_type: 'image/png' }] }))
      .toEqual({ url: 'https://fal/image.png', mimeType: 'image/png' });
    expect(extractFalResult('video', { video: { url: 'https://fal/video.mp4', content_type: 'video/mp4' } }))
      .toEqual({ url: 'https://fal/video.mp4', mimeType: 'video/mp4' });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test tests/fal/catalog.test.ts`

Expected: FAIL because `lib/fal/catalog.ts` does not exist.

- [ ] **Step 3: Define stable fal types**

Create `lib/fal/types.ts` with these public contracts:

```ts
export type FalMediaType = 'image' | 'video';
export type FalInputMode = 'text' | 'image';
export type FalValue = string | number | boolean;
export type FalFieldType = 'text' | 'number' | 'boolean' | 'select';

export interface FalFieldOption { label: string; value: string | number; }
export interface FalFieldDefinition {
  key: string;
  label: string;
  type: FalFieldType;
  description?: string;
  defaultValue?: FalValue;
  options?: FalFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface FalModelVariant {
  id: string;
  endpointId: string;
  inputMode: FalInputMode;
  imageInputKey?: 'image_url' | 'image_urls' | 'start_image_url';
  imageInputMultiple?: boolean;
  maxInputImages?: number;
  fields: FalFieldDefinition[];
}

export interface FalModelDefinition {
  id: string;
  label: string;
  provider: string;
  description: string;
  mediaType: FalMediaType;
  variants: FalModelVariant[];
}

export type FalTaskState = 'queued' | 'running' | 'success' | 'fail' | 'timed_out' | 'cancelled';
export interface FalTask {
  requestId: string;
  state: FalTaskState;
  logs: string[];
  resultUrl?: string;
  mimeType?: string;
  error?: string;
}
export interface FalJob extends FalTask {
  id: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  prompt: string;
  createdAt: number;
  updatedAt: number;
  pollAttempt: number;
}
```

- [ ] **Step 4: Implement the exact static catalog and safe builders**

Create `lib/fal/catalog.ts`. Use small field factories, but encode this exact endpoint matrix and conservative verified controls:

| Choice | Text endpoint | Image endpoint | Exposed controls |
|---|---|---|---|
| Nano Banana 2 | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | aspect ratio; 1K/2K/4K; web search |
| Veo 3.1 | `fal-ai/veo3.1` | `fal-ai/veo3.1/image-to-video` | duration 4s/6s/8s; 720p/1080p/4k; audio; aspect ratio |
| Veo 3.1 Fast | `fal-ai/veo3.1/fast` | `fal-ai/veo3.1/fast/image-to-video` | same as Veo 3.1 |
| Seedance 2.0 | `bytedance/seedance-2.0/text-to-video` | `bytedance/seedance-2.0/image-to-video` | duration auto/4–15; 480p/720p/1080p/4k; audio; aspect ratio; bitrate |
| Seedance 2.0 Fast | `bytedance/seedance-2.0/fast/text-to-video` | `bytedance/seedance-2.0/fast/image-to-video` | duration auto/4–15; 480p/720p; audio; aspect ratio; bitrate |
| Kling 3 Standard | `fal-ai/kling-video/v3/standard/text-to-video` | `fal-ai/kling-video/v3/standard/image-to-video` | duration 3–15; audio; text aspect ratio; negative prompt |
| Kling 3 Pro | `fal-ai/kling-video/v3/pro/text-to-video` | `fal-ai/kling-video/v3/pro/image-to-video` | duration 3–15; audio; text aspect ratio; negative prompt |
| Sora 2 | `fal-ai/sora-2/text-to-video` | `fal-ai/sora-2/image-to-video` | duration 4/8/12/16/20; auto/720p; aspect ratio; delete video |
| Sora 2 Pro | `fal-ai/sora-2/text-to-video/pro` | `fal-ai/sora-2/image-to-video/pro` | duration 4/8/12/16/20; 720p/1080p/true_1080p; aspect ratio; delete video |
| Wan 2.7 | `fal-ai/wan/v2.7/text-to-video` | `fal-ai/wan/v2.7/image-to-video` | duration 2–15; 720p/1080p; text aspect ratio; negative prompt; prompt expansion |

The builders must filter `values` through `variant.fields` so the browser cannot inject arbitrary model arguments:

```ts
export function buildFalInput(
  variant: FalModelVariant,
  args: { prompt: string; uploadUrls: string[]; values: Record<string, FalValue> }
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: args.prompt.trim() };
  if (variant.inputMode === 'image' && variant.imageInputKey) {
    input[variant.imageInputKey] = variant.imageInputMultiple ? args.uploadUrls : args.uploadUrls[0];
  }
  for (const field of variant.fields) {
    const value = args.values[field.key] ?? field.defaultValue;
    if (value !== undefined && value !== '') input[field.key] = value;
  }
  return input;
}

export function extractFalResult(mediaType: FalMediaType, payload: unknown) {
  const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const media = mediaType === 'image'
    ? (Array.isArray(record.images) ? record.images[0] : undefined)
    : record.video;
  const file = media !== null && typeof media === 'object' ? media as Record<string, unknown> : {};
  if (typeof file.url !== 'string' || !file.url) throw new Error('fal completed without a usable media URL.');
  return { url: file.url, mimeType: typeof file.content_type === 'string' ? file.content_type : undefined };
}
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/fal/catalog.test.ts`

Expected: 5 tests PASS.

```bash
git add lib/fal/types.ts lib/fal/catalog.ts tests/fal/catalog.test.ts
git commit -m "feat: add verified fal model catalog"
```

---

### Task 2: Persist fal provider preferences and expose the image engine

**Files:**

- Create: `tests/fal/provider-state.test.ts`
- Modify: `lib/engines/registry.ts:6-71`
- Modify: `store/useAppStore.ts:11-133`

- [ ] **Step 1: Write failing provider-state tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINES, enginesForFeature } from '../../lib/engines/registry';
import { useAppStore } from '../../store/useAppStore';
import { FEATURES } from '../../types';

describe('fal provider state', () => {
  beforeEach(() => useAppStore.setState({
    falApiKey: '', videoEngine: 'kie', falVideoModel: 'veo-3-1-fast',
  }));

  it('offers fal for all six image features', () => {
    expect(ENGINES.find((engine) => engine.id === 'fal')).toMatchObject({
      supportsInputImages: true,
      supportsGoogleSearch: true,
      supportsAspectRatio: true,
      supportsImageSize: true,
    });
    for (const feature of FEATURES) {
      expect(enginesForFeature(feature).map((engine) => engine.id)).toContain('fal');
    }
  });

  it('updates the BYOK key, video provider, and selected fal model', () => {
    useAppStore.getState().setFalApiKey('id:secret');
    useAppStore.getState().setVideoEngine('fal');
    useAppStore.getState().setFalVideoModel('sora-2-pro');
    expect(useAppStore.getState()).toMatchObject({
      falApiKey: 'id:secret', videoEngine: 'fal', falVideoModel: 'sora-2-pro',
    });
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/provider-state.test.ts`

Expected: FAIL because `fal` is not an `EngineId` and the store fields do not exist.

- [ ] **Step 3: Add registry and store state**

Extend `EngineId` with `'fal'` and append:

```ts
{
  id: 'fal',
  label: 'fal.ai · Nano Banana 2',
  blurb: 'BYOK · all six image modes · Nano Banana 2',
  requiresApiKey: true,
  supportsInputImages: true,
  supportsGoogleSearch: true,
  supportsAspectRatio: true,
  supportsImageSize: true,
  free: false,
}
```

Add these exact store fields, defaults, setters, and `partialize` entries:

```ts
falApiKey: string;
videoEngine: 'kie' | 'fal';
falVideoModel: string;
setFalApiKey: (key: string) => void;
setVideoEngine: (engine: 'kie' | 'fal') => void;
setFalVideoModel: (modelId: string) => void;

// defaults
falApiKey: '',
videoEngine: 'kie',
falVideoModel: 'veo-3-1-fast',
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test tests/fal/provider-state.test.ts tests/generation-interface.test.tsx`

Expected: both files PASS; existing persisted users still fall back to defaults for absent fields.

```bash
git add lib/engines/registry.ts store/useAppStore.ts tests/fal/provider-state.test.ts
git commit -m "feat: persist fal provider preferences"
```

---

### Task 3: Add the per-request fal server adapter

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `lib/fal/server.ts`
- Create: `tests/fal/server.test.ts`

- [ ] **Step 1: Write failing server-adapter tests**

Mock `createFalClient` before importing `lib/fal/server`. Cover a fresh client per key, pricing validation, one-day uploads, allow-listed submission, completion/result extraction, cancellation, and secret-safe errors:

```ts
const { createFalClient } = vi.hoisted(() => ({ createFalClient: vi.fn() }));
vi.mock('@fal-ai/client', () => ({ createFalClient }));

it('submits only the catalog endpoint with privacy headers', async () => {
  const submit = vi.fn().mockResolvedValue({ request_id: 'req_123' });
  createFalClient.mockReturnValue({ queue: { submit } });
  await expect(submitFalTask({
    apiKey: 'id:secret', modelId: 'veo-3-1-fast', mediaType: 'video', inputMode: 'text',
    prompt: 'A crane flying over a lake', uploadUrls: [],
    values: { duration: '8s', resolution: '720p', generate_audio: true },
  })).resolves.toEqual({ requestId: 'req_123' });
  expect(submit).toHaveBeenCalledWith('fal-ai/veo3.1/fast', expect.objectContaining({
    headers: { 'X-Fal-Store-IO': '0' },
    storageSettings: { expiresIn: '7d' },
  }));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/server.test.ts`

Expected: FAIL because `@fal-ai/client` and `lib/fal/server.ts` do not exist.

- [ ] **Step 3: Install the official client**

Run: `pnpm add @fal-ai/client@1.10.1`

Expected: `package.json` and `pnpm-lock.yaml` update with the exact client version.

- [ ] **Step 4: Implement server operations without global credentials**

Create `lib/fal/server.ts`. Every operation must call `createFalClient({ credentials: apiKey })`; never call global `fal.config`, which could mix concurrent users' keys.

Export:

```ts
export class FalApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function validateFalApiKey(apiKey: string): Promise<void>;
export async function uploadFalFile(args: { apiKey: string; file: File }): Promise<string>;
export async function submitFalTask(args: {
  apiKey: string; modelId: string; mediaType: FalMediaType; inputMode: FalInputMode;
  prompt: string; uploadUrls: string[]; values: Record<string, FalValue>;
}): Promise<{ requestId: string }>;
export async function getFalTask(args: {
  apiKey: string; modelId: string; mediaType: FalMediaType; inputMode: FalInputMode; requestId: string;
}): Promise<FalTask>;
export async function cancelFalTask(args: {
  apiKey: string; modelId: string; mediaType: FalMediaType; inputMode: FalInputMode; requestId: string;
}): Promise<void>;
```

Key validation must request:

```ts
fetch('https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fnano-banana-2', {
  headers: { Authorization: `Key ${apiKey}` },
});
```

Use `client.storage.upload(file, { lifecycle: { expiresIn: '1d' } })`. Submit with `{ input, headers: { 'X-Fal-Store-IO': '0' }, storageSettings: { expiresIn: '7d' } }`. Map SDK states `IN_QUEUE`, `IN_PROGRESS`, and `COMPLETED` to `queued`, `running`, and the extracted result. Resolve the endpoint through `resolveFalVariant` on submit, status, and cancel; never accept an endpoint string from callers.

Normalize errors with no provider body fallback that could echo credentials:

```ts
function publicMessage(status: number): string {
  if (status === 401 || status === 403) return 'Your fal API key is invalid, revoked, or lacks access to this model.';
  if (status === 402) return 'Your fal account needs additional credits.';
  if (status === 422) return 'fal rejected one or more model settings. Review the controls and try again.';
  if (status === 429) return 'fal is rate limiting requests. Please wait and try again.';
  if (status >= 500) return 'fal is temporarily unavailable. Please try again.';
  return 'fal could not complete that request.';
}
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/fal/server.test.ts tests/fal/catalog.test.ts`

Expected: all tests PASS.

```bash
git add package.json pnpm-lock.yaml lib/fal/server.ts tests/fal/server.test.ts
git commit -m "feat: add secure fal server adapter"
```

---

### Task 4: Add allow-listed fal API routes

**Files:**

- Create: `app/api/fal/validate/route.ts`
- Create: `app/api/fal/upload/route.ts`
- Create: `app/api/fal/queue/route.ts`
- Create: `tests/fal/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock functions from `lib/fal/server` and cover validation, upload, submit, status, cancel, missing credentials, invalid modes, malformed request IDs, and sanitized status propagation. Use this concrete submit assertion:

```ts
const response = await queuePost(new Request('http://localhost/api/fal/queue', {
  method: 'POST',
  body: JSON.stringify({
    operation: 'submit', apiKey: 'id:secret', modelId: 'wan-2-7',
    mediaType: 'video', inputMode: 'text', prompt: 'A storm over the desert',
    uploadUrls: [], values: { duration: 5, resolution: '1080p' },
  }),
}) as NextRequest);
await expect(response.json()).resolves.toEqual({ success: true, requestId: 'req_wan' });
expect(submitFalTask).toHaveBeenCalledWith(expect.objectContaining({
  apiKey: 'id:secret', modelId: 'wan-2-7', inputMode: 'text',
}));
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/routes.test.ts`

Expected: FAIL because the three routes do not exist.

- [ ] **Step 3: Implement validate and upload routes**

Follow the existing Kie route structure. `validate` accepts JSON `{ apiKey }`; `upload` accepts multipart `apiKey` and `file`. Return only `{ success: true }` or `{ success: true, url }`. Convert `FalApiError.status` to the HTTP status without returning upstream payloads.

- [ ] **Step 4: Implement the queue action route**

Accept only `operation: 'submit' | 'status' | 'cancel'`. Parse `mediaType`, `inputMode`, `uploadUrls`, and primitive `values` with local type guards. Require a non-empty key and require status/cancel request IDs to match `/^[A-Za-z0-9_-]{8,128}$/`; return HTTP 400 before calling the adapter when they do not. Pass catalog IDs—not endpoint URLs—to `submitFalTask`, `getFalTask`, and `cancelFalTask`.

```ts
if (body.operation === 'status') {
  const task = await getFalTask({ apiKey, modelId, mediaType, inputMode, requestId });
  return NextResponse.json({ success: true, task });
}
if (body.operation === 'cancel') {
  await cancelFalTask({ apiKey, modelId, mediaType, inputMode, requestId });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/fal/routes.test.ts tests/fal/server.test.ts`

Expected: all tests PASS.

```bash
git add app/api/fal tests/fal/routes.test.ts
git commit -m "feat: add allow-listed fal queue routes"
```

---

### Task 5: Add browser transport, image runner, queue helpers, and job state

**Files:**

- Create: `lib/fal/browser.ts`
- Create: `lib/fal/queue.ts`
- Create: `store/useFalJobsStore.ts`
- Create: `tests/fal/browser.test.ts`
- Create: `tests/fal/queue.test.ts`

- [ ] **Step 1: Write failing browser and queue tests**

Cover multipart uploads, submit/status/cancel JSON, response errors, bounded delays, store upserts, a successful image queue, provider failure, and a 15-minute local timeout. Inject clock/sleep into the image runner so tests do not wait:

```ts
await expect(runFalImage({
  apiKey: 'id:secret', prompt: 'A banana observatory', dataUrls: [],
  values: { aspect_ratio: '16:9', resolution: '1K', enable_web_search: false },
}, {
  now: vi.fn().mockReturnValueOnce(0).mockReturnValue(1000),
  sleep: vi.fn().mockResolvedValue(undefined),
})).resolves.toEqual({ url: 'https://fal/image.png', mimeType: 'image/png' });
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/browser.test.ts tests/fal/queue.test.ts`

Expected: FAIL because browser, queue, and store modules do not exist.

- [ ] **Step 3: Implement queue and store primitives**

```ts
export const FAL_JOB_TIMEOUT_MS = 15 * 60 * 1_000;
export function nextFalPollDelay(attempt: number) {
  return Math.min(2_500 * 2 ** attempt, 15_000);
}
export function isFalJobTerminal(state: FalTaskState) {
  return state === 'success' || state === 'fail' || state === 'timed_out' || state === 'cancelled';
}
```

Mirror `useKieJobsStore` with `FalJob[]`, `upsertJob`, `removeJob`, and `clearJobs`. Keep it intentionally non-persisted.

- [ ] **Step 4: Implement browser transport and the image queue runner**

Export `uploadFalFiles`, `submitFalJob`, `getFalJobStatus`, `cancelFalJob`, and `runFalImage`. Convert image data URLs to `File` objects before multipart upload:

```ts
async function dataUrlToFile(dataUrl: string, index: number): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const extension = blob.type.includes('png') ? 'png' : 'jpg';
  return new File([blob], `reference-${index + 1}.${extension}`, { type: blob.type });
}
```

`runFalImage` uploads references, submits model `nano-banana-2` in `text` or `image` mode, polls with `nextFalPollDelay`, returns the task's `resultUrl`/`mimeType`, throws the normalized task error, and stops after `FAL_JOB_TIMEOUT_MS` without sending cancel.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/fal/browser.test.ts tests/fal/queue.test.ts`

Expected: all tests PASS.

```bash
git add lib/fal/browser.ts lib/fal/queue.ts store/useFalJobsStore.ts tests/fal/browser.test.ts tests/fal/queue.test.ts
git commit -m "feat: add fal browser queue client"
```

---

### Task 6: Add fal BYOK connection UI

**Files:**

- Create: `tests/fal/api-key-config.test.tsx`
- Modify: `components/ApiKeyConfig.tsx:14-358`
- Modify: `app/page.tsx:28-45`

- [ ] **Step 1: Write a failing UI test**

```ts
it('validates and saves a fal key without generating media', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 })
  ));
  render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('fal API key'), { target: { value: 'id:secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/fal/validate', expect.objectContaining({ method: 'POST' })));
  expect(useAppStore.getState().falApiKey).toBe('id:secret');
});
```

Also test that a `401` response leaves the key unsaved and renders the route's error.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/api-key-config.test.tsx`

Expected: FAIL because the fal input is absent.

- [ ] **Step 3: Add fal connection state and UI**

Add `savedFalKey`, `setFalApiKey`, `falKeyInput`, `showFalKey`, and `falValidationError`. Seed/reset them in the existing open effect. Validate changed non-empty keys through `/api/fal/validate` before saving.

Render a section before Cloudflare:

```tsx
<section className="space-y-3">
  <div className="flex items-center justify-between gap-3">
    <p className="eyebrow">fal.ai · image and video BYOK</p>
    <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer">Get a key →</a>
  </div>
  <input aria-label="fal API key" type={showFalKey ? 'text' : 'password'} value={falKeyInput} />
  <p className="text-xs text-[var(--foreground-subtle)]">
    Validated through fal pricing without starting a billable generation.
  </p>
</section>
```

Update `hasKey` in `app/page.tsx` to include `falApiKey`.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test tests/fal/api-key-config.test.tsx tests/kie/api-key-config.test.tsx`

Expected: fal and Kie connection tests PASS.

```bash
git add components/ApiKeyConfig.tsx app/page.tsx tests/fal/api-key-config.test.tsx
git commit -m "feat: add fal BYOK connection"
```

---

### Task 7: Route all six image modes through fal Nano Banana 2

**Files:**

- Modify: `components/GenerationInterface.tsx:100-346`
- Modify: `tests/generation-interface.test.tsx`

- [ ] **Step 1: Add failing image-engine tests**

Mock `runFalImage`. Test that the fal pill renders in every `FEATURES` entry, a text request passes `text`, an uploaded reference passes `image`, resolution/aspect/search values are forwarded, missing fal credentials opens API connections, and the returned URL renders in the preview.

```ts
expect(runFalImage).toHaveBeenCalledWith(expect.objectContaining({
  apiKey: 'fal_id:fal_secret',
  prompt: 'A bright editorial still life',
  values: { aspect_ratio: '16:9', resolution: '2K', enable_web_search: true },
}));
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/generation-interface.test.tsx`

Expected: new fal tests FAIL while existing engine tests remain green.

- [ ] **Step 3: Add the fal mutation branch**

Read `falApiKey` from the store. Before the existing `/api/generate` fetch, branch on `activeEngine.id === 'fal'`:

```ts
if (activeEngine.id === 'fal') {
  const result = await runFalImage({
    apiKey: falApiKey,
    prompt: finalPrompt,
    dataUrls: images,
    values: {
      aspect_ratio: config.aspectRatio ?? 'auto',
      resolution: config.imageSize ?? '1K',
      enable_web_search: Boolean(config.useGoogleSearch),
    },
  });
  const ext = result.mimeType?.includes('jpeg') ? 'jpg' : 'png';
  return { dataUrl: result.url, ext };
}
```

In `handleGenerate`, open connections with a specific message when fal is active and the key is empty. Keep existing Gemini prompt examples/filename slugs optional. Add a fal cost line that avoids stale hard-coded pricing: `fal usage rates apply · Nano Banana 2`. Make the existing download handler fetch remote fal result URLs into a `Blob`, download through a temporary object URL, and revoke it afterward; preserve the current data-URL path and surface a safe download error if the remote fetch fails.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test tests/generation-interface.test.tsx tests/fal/catalog.test.ts tests/fal/browser.test.ts`

Expected: all tests PASS.

```bash
git add components/GenerationInterface.tsx tests/generation-interface.test.tsx
git commit -m "feat: add fal image generation"
```

---

### Task 8: Extract the neutral model-control UI

**Files:**

- Create: `components/ModelControls.tsx`
- Create: `tests/model-controls.test.tsx`
- Modify: `components/KieGenerationWorkspace.tsx:220-382,450-454`
- Modify: `tests/kie/workspace.test.tsx`

- [ ] **Step 1: Write a failing focused component test**

Import the absent `ModelControls` and verify boolean, select, number, text, and resolution fields call `onChange`, with resolution rendered through `SegmentedToggleGroup`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/model-controls.test.tsx`

Expected: FAIL because `components/ModelControls.tsx` does not exist.

- [ ] **Step 3: Implement the structural field renderer**

The component accepts a structural type compatible with both Kie and fal fields:

```ts
interface ModelControlsProps {
  namespace: string;
  fields: Array<{
    key: string; label: string; type: 'text' | 'number' | 'boolean' | 'select' | 'file';
    description?: string; defaultValue?: string | number | boolean;
    options?: Array<{ label: string; value: string | number }>;
    min?: number; max?: number; step?: number;
  }>;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
}
```

Move the existing `renderField` behavior verbatim, including the special horizontal `resolution` toggle. Use `namespace` for IDs instead of the Kie-specific prefix.

- [ ] **Step 4: Replace only Kie's field loop**

Replace `{variant.fields.map(renderField)}` with:

```tsx
<ModelControls
  namespace={`kie-${variantKey}`}
  fields={variant.fields}
  values={values}
  onChange={updateValues}
/>
```

Do not alter Kie catalog, request mapping, polling, or result behavior.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/model-controls.test.tsx tests/kie/workspace.test.tsx`

Expected: new component tests and all Kie workspace tests PASS.

```bash
git add components/ModelControls.tsx components/KieGenerationWorkspace.tsx tests/model-controls.test.tsx tests/kie/workspace.test.tsx
git commit -m "refactor: share model control rendering"
```

---

### Task 9: Poll fal video jobs without resubmission

**Files:**

- Create: `components/FalJobsProvider.tsx`
- Create: `tests/fal/jobs-provider.test.tsx`
- Modify: `app/providers.tsx:1-36`

- [ ] **Step 1: Write failing polling tests**

Mirror the Kie provider test shape. Cover queued → success, one transient status rejection that keeps the job active, and a 15-minute local timeout that transitions the job to `timed_out` without cancelling upstream. Assert `submitFalJob` is never imported or invoked by the provider.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/jobs-provider.test.tsx`

Expected: FAIL because `FalJobsProvider` does not exist.

- [ ] **Step 3: Implement bounded per-job polling**

Read `falApiKey` and active jobs. Schedule each nonterminal job with `nextFalPollDelay(job.pollAttempt)`. Call only `getFalJobStatus`, then merge the returned task and increment `pollAttempt`. On a temporary fetch rejection, keep the job active and increment the attempt. Once `now - createdAt >= FAL_JOB_TIMEOUT_MS`, set `state: 'timed_out'` with a safe message, stop polling, and do not cancel the durable upstream request. Never call submit.

- [ ] **Step 4: Mount the provider**

```tsx
<KieJobsProvider>
  <FalJobsProvider>{children}</FalJobsProvider>
</KieJobsProvider>
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test tests/fal/jobs-provider.test.tsx tests/kie/jobs-provider.test.tsx`

Expected: fal and Kie providers PASS.

```bash
git add components/FalJobsProvider.tsx app/providers.tsx tests/fal/jobs-provider.test.tsx
git commit -m "feat: poll fal video jobs"
```

---

### Task 10: Add the curated fal video workspace

**Files:**

- Create: `components/ProviderSelector.tsx`
- Create: `components/FalGenerationWorkspace.tsx`
- Create: `tests/fal/workspace.test.tsx`
- Create: `tests/video-workspace.test.tsx`
- Modify: `components/VideoWorkspace.tsx:1-61`

- [ ] **Step 1: Write failing provider and workspace tests**

Test these behaviors:

- Video defaults to the persisted provider.
- Clicking fal updates `videoEngine` and renders `FalGenerationWorkspace`.
- Text/image mode changes preserve the selected provider.
- Fal search finds all nine choices and filters by label/provider.
- The default Veo Fast controls render exact defaults.
- Image mode requires one reference.
- Submission uploads once, queues once, and inserts a tab-local job.
- A completed job renders `<video>` and a download action.
- Cancel calls `cancelFalJob` and marks the job cancelled.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test tests/fal/workspace.test.tsx tests/video-workspace.test.tsx`

Expected: FAIL because the fal workspace/provider selector do not exist.

- [ ] **Step 3: Implement the provider selector**

Create a pill selector with `aria-label="Video provider"` and two options:

```ts
const providers = [
  { id: 'kie' as const, label: 'Kie.ai', blurb: '15 image/video families' },
  { id: 'fal' as const, label: 'fal.ai', blurb: '9 verified video choices' },
];
```

- [ ] **Step 4: Implement `FalGenerationWorkspace`**

Follow the Kie workspace layout but use only fal modules and the shared `ModelControls`. Required state and flow:

```ts
const models = modelsForFalMode('video', inputMode);
const selectedModel = models.find((model) => model.id === falVideoModel) ?? models[0];
const variant = resolveFalVariant(selectedModel.id, 'video', inputMode);
const values = defaultFalValues(variant);
```

On submit: require `falApiKey`; validate prompt/reference count; upload references; call `submitFalJob`; insert a `FalJob` with `state: 'queued'`, timestamps, empty logs, and `pollAttempt: 0`. The result panel uses `resultUrl`, request ID, safe logs/errors, direct video preview, download, and a cancel button for queued/running jobs. It renders distinct queued, running, success, failure, timed-out, and cancelled states. Include the notice: `fal inputs and outputs use public, temporary CDN URLs.`

- [ ] **Step 5: Switch Video workspace by persisted provider**

Render `ProviderSelector` under the existing text/image header. Render Kie unchanged when `videoEngine === 'kie'`; otherwise render `FalGenerationWorkspace` with the same `inputMode`, `onBack`, and `onOpenConnections` props.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test tests/fal/workspace.test.tsx tests/video-workspace.test.tsx tests/kie/workspace.test.tsx`

Expected: all fal, video routing, and existing Kie workspace tests PASS.

```bash
git add components/ProviderSelector.tsx components/FalGenerationWorkspace.tsx components/VideoWorkspace.tsx tests/fal/workspace.test.tsx tests/video-workspace.test.tsx
git commit -m "feat: add curated fal video workspace"
```

---

### Task 11: Update documentation and run full verification

**Files:**

- Modify: `README.md:1-205`

- [ ] **Step 1: Update README facts**

Make these exact documentation changes:

- Change “Four Media Providers” to “Five Media Providers”.
- Add fal.ai / Nano Banana 2 to the image matrix and state it supports all six modes.
- Add the nine-choice fal video catalog and distinguish it from Kie's seven video families.
- Add fal dashboard key setup and BYOK connection steps.
- Add `@fal-ai/client` and `lib/fal` to stack/project structure.
- Explain queue submit/status/cancel, 15-minute local polling, no app auto-resubmit, and tab-local job state.
- Explain `X-Fal-Store-IO: 0`, one-day reference uploads, seven-day outputs, public fal CDN URLs, and prompt download guidance.
- Link the official fal docs listed in the plan header.
- Update the security section without claiming fal stores no media.

- [ ] **Step 2: Run focused fal verification**

Run: `pnpm test tests/fal`

Expected: every fal test file passes with zero failures.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`

Expected: all existing and new tests PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 5: Run the production build**

Run: `pnpm build`

Expected: Next.js production build exits 0 and includes `/api/fal/validate`, `/api/fal/upload`, and `/api/fal/queue` routes.

- [ ] **Step 6: Inspect the final diff and commit**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended fal integration/documentation files are modified. The pre-existing untracked dependency-longevity docs remain untouched.

```bash
git add README.md
git commit -m "docs: document fal provider support"
```

---

## Completion checklist

- [ ] fal appears in all six image modes and uses Nano Banana 2 text/edit endpoints correctly.
- [ ] Video exposes exactly nine curated family/tier choices and 18 verified endpoints.
- [ ] BYOK credentials remain browser-persisted and use per-request server clients.
- [ ] No route accepts arbitrary fal URLs or endpoint IDs.
- [ ] Reference uploads and output retention match the documented lifecycle.
- [ ] JSON request history is disabled with `X-Fal-Store-IO: 0`.
- [ ] Queue polling never resubmits a billable job.
- [ ] Kie transport/catalog behavior remains unchanged.
- [ ] Tests, lint, and production build pass with fresh evidence.
