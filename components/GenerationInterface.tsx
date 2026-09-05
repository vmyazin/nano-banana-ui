// components/GenerationInterface.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCloudWorkspace } from '@/lib/account/useCloudWorkspace';
import { SINGLE_IMAGE_MODELS } from '@/lib/account/models';
import { featureImagePrompt } from '@/lib/image/feature-prompt';
import CloudExecutionNotice from '@/components/account/CloudExecutionNotice';
import CloudJobPanel from '@/components/account/CloudJobPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Feature, GenerationConfig } from '@/types';
import { useFileDrop } from '@/lib/drop/use-file-drop';
import { metaForFeature, slugify } from '@/lib/example-prompts';
import { geminiResolutionCost } from '@/lib/spend/rates';
import { requestExamplePrompt, requestPromptSlug } from '@/lib/micro-ai/browser';
import {
  boundedMediaBlob,
  extensionForMimeType,
  MAX_REMOTE_IMAGE_BYTES,
  normalizedMimeType,
  SUPPORTED_RASTER_MIMES,
} from '@/lib/media-download';
import { runFalImage } from '@/lib/fal/browser';
import { FAL_IMAGE_MODEL } from '@/lib/fal/catalog';
import type { EngineUsage } from '@/lib/engines/gemini';
import { captureImageResult } from '@/lib/spend/capture';
import { downloadFilenameBase } from '@/lib/download-name';
import { convertedForDownload } from '@/lib/image/download-format';
import ProviderLogo from '@/components/ProviderLogo';
import AutoExpandingPrompt from '@/components/AutoExpandingPrompt';
import PromptPanel from '@/components/PromptPanel';
import { useAppStore } from '@/store/useAppStore';
import { modelsFor, resolveModel } from '@/lib/providers/catalog';
import type { ProviderId } from '@/lib/providers/types';
import { prepareReferences } from '@/lib/draft/ingest';
import { useDraftStore } from '@/store/useDraftStore';
import { usePromptLibraryStore } from '@/store/usePromptLibraryStore';
import { useGalleryStore } from '@/store/useGalleryStore';
import { blobFromDataUrl, resultBlob } from '@/lib/gallery/capture';
import { candidatesFromValues, useAutoAspect } from '@/lib/draft/aspect-match';
import { isValueCompatible, type CarryOverField } from '@/lib/draft/carry-over';
import {
  enginesForFeature,
  type EngineId,
  type EngineMeta,
} from '@/lib/engines/registry';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import SegmentedToggleGroup from '@/components/SegmentedToggleGroup';
import StoredImagePicker from '@/components/StoredImagePicker';
import ImageFormatControl from '@/components/ImageFormatControl';
import { playGenerationChime } from '@/lib/notify/chime';
import ResultStack, { type ResultStackItem } from '@/components/ResultStack';
import RetryCountdown from '@/components/RetryCountdown';
import {
  AUTO_RETRY_DELAY_SECONDS,
  isRetryableFailure,
  useAutoRetry,
} from '@/lib/providers/auto-retry';
import { RouteError, routeStatus } from '@/lib/providers/route-error';
import ReferenceStack from '@/components/ReferenceStack';
import {
  Wand2,
  Loader2,
  ImagePlus,
  Info,
  Sparkles,
} from 'lucide-react';

interface GenerationInterfaceProps {
  feature: Feature;
  apiKey: string;
  onBack: () => void;
  onOpenConnections: (provider?: EngineId) => void;
}

const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Image could not be read'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'));
    reader.readAsDataURL(file);
  });

const RESOLUTION_OPTIONS = ['1K', '2K', '4K'].map((value) => ({
  label: value,
  value,
}));

const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 (Square - Instagram Post)' },
  { value: '3:4', label: '3:4 (Portrait)' },
  { value: '9:16', label: '9:16 (Story/Reels)' },
  { value: '16:9', label: '16:9 (YouTube Thumbnail)' },
  { value: '21:9', label: '21:9 (Ultra Wide)' },
  { value: '3:2', label: '3:2 (Classic Photo)' },
  { value: '4:3', label: '4:3 (Standard)' },
];

const ASPECT_RATIO_CANDIDATES = candidatesFromValues(
  ASPECT_RATIO_OPTIONS.map((option) => option.value)
);

// Named with the catalogue's keys so a choice made here reaches the video
// workspaces, and vice versa, through the same carry-over rule.
const ASPECT_RATIO_FIELD: CarryOverField = {
  key: 'aspect_ratio',
  type: 'select',
  options: ASPECT_RATIO_OPTIONS,
};
const RESOLUTION_FIELD: CarryOverField = {
  key: 'resolution',
  type: 'select',
  options: RESOLUTION_OPTIONS,
};

function draftedConfig(): GenerationConfig {
  const remembered = useDraftStore.getState().controlValues;
  const aspectRatio = remembered.aspect_ratio;
  const imageSize = remembered.resolution;
  return {
    aspectRatio: isValueCompatible(ASPECT_RATIO_FIELD, aspectRatio)
      ? (aspectRatio as GenerationConfig['aspectRatio'])
      : '16:9',
    imageSize: isValueCompatible(RESOLUTION_FIELD, imageSize)
      ? (imageSize as GenerationConfig['imageSize'])
      : '1K',
    useGoogleSearch: false,
  };
}

const FAL_GENERATION_ERROR = 'Unable to generate this image with fal. Please try again.';
const DOWNLOAD_ERROR = 'Unable to download this image. Please try again.';
const MAX_FAL_REFERENCE_BYTES = 20 * 1024 * 1024;

class LocalFalCancellation extends Error {
  constructor() {
    super('Local fal operation cancelled');
    this.name = 'LocalFalCancellation';
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isSafeFalMediaUrl(value: string) {
  try {
    const url = new URL(value);
    const isFalMedia = url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media');
    return url.protocol === 'https:' && !url.username && !url.password && isFalMedia;
  } catch {
    return false;
  }
}

interface EngineSelectorProps {
  engines: EngineMeta[];
  accountMode?: boolean;
  activeEngineId: EngineId;
  onSelect: (engineId: EngineId) => void;
}

function EngineSelector({ engines, activeEngineId, onSelect, accountMode = false }: EngineSelectorProps) {
  if (engines.length <= 1) return null;

  return (
    <section
      aria-label="Generation engine"
      className="glass-card px-3.5 py-2.5 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="eyebrow mr-0.5">Engine</span>
        {engines.map((engine) => {
          const active = engine.id === activeEngineId;
          return (
            <button
              key={engine.id}
              type="button"
              onClick={() => onSelect(engine.id)}
              title={accountMode && engine.id === 'pollinations' ? 'Background generation uses your saved Pollinations key and provider balance.' : engine.blurb}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? 'border-[var(--neon-cyan)] text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                  : 'border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
              }`}
            >
              <ProviderLogo provider={engine.id} size={13} />
              {engine.label}
              {engine.free && !(accountMode && engine.id === 'pollinations') && (
                <span className="text-[0.62rem] uppercase tracking-wide text-emerald-400">
                  Free
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function GenerationInterface({ feature, apiKey, onBack, onOpenConnections }: GenerationInterfaceProps) {
  const prompt = useDraftStore((state) => state.prompt);
  const setPrompt = useDraftStore((state) => state.setPrompt);
  const references = useDraftStore((state) => state.references);
  // The id travels with the bytes rather than living in a parallel array: the
  // read is async, so for one render after a removal a bare `string[]` would
  // be longer than `references` and item i would pair the wrong reference's
  // id with the previous reference's data URL — which is exactly the id the
  // reference lightbox keys its "which one is open" state on.
  const [images, setImages] = useState<Array<{ id: string; dataUrl: string }>>([]);
  const [config, setConfig] = useState<GenerationConfig>(draftedConfig);

  // Mirrored into the draft so the video workspaces inherit the same choice.
  const applyConfig = (next: GenerationConfig) => {
    setConfig(next);
    useDraftStore.getState().rememberControlValues({
      aspect_ratio: next.aspectRatio ?? '16:9',
      resolution: next.imageSize ?? '1K',
    });
  };

  // Adding a reference snaps the aspect ratio to that image's shape.
  useAutoAspect(references[0], ASPECT_RATIO_CANDIDATES, (value) => {
    if (value === config.aspectRatio) return;
    applyConfig({ ...config, aspectRatio: value as NonNullable<GenerationConfig['aspectRatio']> });
  });

  // Engines that can run this feature; fall back to the first (Gemini) if the
  // persisted choice can't (e.g. picked Pollinations then opened an editing mode).
  const storeEngine = useAppStore((s) => s.engine);
  const imageFormat = useAppStore((s) => s.imageFormat);
  const setImageFormat = useAppStore((s) => s.setImageFormat);
  const setEngine = useAppStore((s) => s.setEngine);
  const cfAccountId = useAppStore((s) => s.cfAccountId);
  const cfToken = useAppStore((s) => s.cfToken);
  const falApiKey = useAppStore((s) => s.falApiKey);
  const runwareApiKey = useAppStore((s) => s.runwareApiKey);
  const atlasApiKey = useAppStore((s) => s.atlasApiKey);
  const cometApiKey = useAppStore((s) => s.cometApiKey);
  const runwareImageModel = useAppStore((s) => s.runwareImageModel);
  const atlasImageModel = useAppStore((s) => s.atlasImageModel);
  const cometImageModel = useAppStore((s) => s.cometImageModel);
  const setProviderModel = useAppStore((s) => s.setProviderModel);
  const hasCfCreds = !!cfAccountId && !!cfToken;
  const availableEngines = enginesForFeature(feature);
  const activeEngine =
    availableEngines.find((e) => e.id === storeEngine) ?? availableEngines[0];

  // Aggregator credentials and model choices, keyed by engine id so the gating,
  // the model select, and the cost line stay one branch instead of three.
  const providerKeys: Record<ProviderId, string> = {
    runware: runwareApiKey,
    atlas: atlasApiKey,
    comet: cometApiKey,
  };
  const providerImageModels: Record<ProviderId, string> = {
    runware: runwareImageModel,
    atlas: atlasImageModel,
    comet: cometImageModel,
  };
  // Derived from the persisted engine id rather than from activeEngine: passing
  // anything aliased to activeEngine into an imported helper makes the React
  // compiler treat the object as possibly-mutated, and it then skips optimizing
  // this component entirely. The membership check keeps it in step with the
  // fallback above (persisted engine that can't run this feature → not active).
  const isAggregator =
    storeEngine === 'runware' || storeEngine === 'atlas' || storeEngine === 'comet';
  const activeProvider: ProviderId | null =
    isAggregator && availableEngines.some((engine) => engine.id === storeEngine)
      ? storeEngine
      : null;
  const activeProviderModel = activeProvider
    ? resolveModel(activeProvider, 'image', providerImageModels[activeProvider])
    : null;
  // What the download filename is tagged with. The single-model engines name
  // themselves from the engine registry, so only the model-picking ones answer here.
  const activeModelId = activeProviderModel ?? (storeEngine === 'fal' ? FAL_IMAGE_MODEL.id : undefined);

  const cloudWorkspace = useCloudWorkspace(activeEngine.id);
  const cloudModelId = activeProviderModel ?? (activeEngine.id === 'fal' ? FAL_IMAGE_MODEL.id : activeEngine.id === 'gemini' || activeEngine.id === 'cloudflare' || activeEngine.id === 'pollinations' ? SINGLE_IMAGE_MODELS[activeEngine.id] : activeEngine.id);
  const cloudInputMode = feature.requiresImage ? 'image' : 'text';
  const [cloudSubmitting, setCloudSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Finished results, newest first. Not cleared anywhere on purpose:
   * `app/page.tsx` mounts this component with `key={selectedFeature.id}`, so
   * switching feature remounts it and the stack goes with it.
   */
  const [results, setResults] = useState<ResultStackItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Pre-rendered, AI-summarized download filename for the current prompt.
  const [filenameSlug, setFilenameSlug] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationOperationRef = useRef(0);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadOperationRef = useRef(0);
  /** Monotonic, so a React key survives a newer result being pushed above it. */
  const resultIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationOperationRef.current += 1;
      generationAbortRef.current?.abort();
      generationAbortRef.current = null;
      downloadOperationRef.current += 1;
      downloadAbortRef.current?.abort();
      downloadAbortRef.current = null;
    };
  }, []);

  // Ask flash-lite for a short evocative filename slug for `p` and stash it.
  // Fire-and-forget — download falls back to a client-side slug if it's not ready.
  const prerenderSlug = async (p: string) => {
    // Returns null when the key is missing or the model is unavailable —
    // downloadImage() then falls back to slugify(prompt).
    const slug = await requestPromptSlug(p, apiKey);
    if (slug) setFilenameSlug(slug);
  };

  const addImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      // Silence was fine when only the picker (accept="image/*") fed this, but a drop can
      // arrive carrying anything at all, and a dead zone reads as a broken one.
      if (files.length > 0) setError('Drop an image file, or an image dragged from a web page.');
      return;
    }

    const maxImages = feature.maxImages || 1;

    if (references.length + imageFiles.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    if (activeEngine.id === 'fal') {
      const oversizedIndex = imageFiles.findIndex(
        (file) => file.size > MAX_FAL_REFERENCE_BYTES
      );
      if (oversizedIndex !== -1) {
        setError(`Reference image ${oversizedIndex + 1} is larger than 20 MiB.`);
        return;
      }
    }

    // Re-encoded before any provider sees it: nano banana returns PNG, which is
    // both the largest upload and the format providers handle worst.
    const prepared = await prepareReferences(
      imageFiles.map((file) => ({ file })),
      imageFormat
    );
    if (!mountedRef.current) return;
    useDraftStore.getState().addReferences(prepared, maxImages);
    setError(null);
  }, [activeEngine.id, feature.maxImages, imageFormat, references.length]);

  // Gemini and fal both want data URLs; the draft holds the Files, so they are
  // re-read whenever the reference list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      references.map(async (reference) => ({
        id: reference.id,
        dataUrl: await readImageAsDataUrl(reference.file),
      }))
    )
      .then((next) => {
        if (!cancelled) setImages(next);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to read one or more images');
      });
    return () => {
      cancelled = true;
    };
  }, [references]);

  // A feature accepting fewer images must not inherit more than it can send.
  useEffect(() => {
    useDraftStore.getState().limitReferences(feature.maxImages || 1);
  }, [feature.maxImages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addImageFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  useEffect(() => {
    if (!feature.requiresImage) return;

    const handlePaste = (event: ClipboardEvent) => {
      const imageFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) return;

      event.preventDefault();
      void addImageFiles(imageFiles);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addImageFiles, feature.requiresImage]);

  const { isDragging, isFetching, dropProps } = useFileDrop({
    onFiles: addImageFiles,
    onError: setError,
    disabled: !feature.requiresImage,
  });

  const removeImage = (index: number) => {
    const reference = references[index];
    if (reference) useDraftStore.getState().removeReference(reference.id);
  };

  const autoRetry = useAutoRetry();
  // Latest generate call, so a queued retry re-runs the button's own path.
  const generateRef = useRef<() => void>(() => {});

  const generateMutation = useMutation({
    mutationFn: async (): Promise<{ dataUrl: string; ext: string; mimeType: string; usage?: EngineUsage; cost?: number }> => {
      const finalPrompt = featureImagePrompt(feature.id, prompt, images.length);

      if (activeEngine.id === 'fal') {
        generationAbortRef.current?.abort();
        const operationId = generationOperationRef.current + 1;
        generationOperationRef.current = operationId;
        const controller = new AbortController();
        generationAbortRef.current = controller;

        try {
          const result = await runFalImage({
            apiKey: falApiKey,
            prompt: finalPrompt,
            dataUrls: images.map((image) => image.dataUrl),
            values: {
              aspect_ratio: config.aspectRatio ?? 'auto',
              resolution: config.imageSize ?? '1K',
              enable_web_search: Boolean(config.useGoogleSearch),
            },
            signal: controller.signal,
          }, {});

          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            generationOperationRef.current !== operationId ||
            generationAbortRef.current !== controller
          ) {
            throw new LocalFalCancellation();
          }

          return {
            dataUrl: result.url,
            ext: extensionForMimeType(result.mimeType),
            mimeType: result.mimeType ?? 'image/png',
          };
        } catch (caught) {
          if (
            caught instanceof LocalFalCancellation ||
            isAbortError(caught) ||
            controller.signal.aborted ||
            !mountedRef.current ||
            generationOperationRef.current !== operationId ||
            generationAbortRef.current !== controller
          ) {
            throw new LocalFalCancellation();
          }
          throw new RouteError(FAL_GENERATION_ERROR, routeStatus(caught) ?? -1);
        } finally {
          if (
            generationOperationRef.current === operationId &&
            generationAbortRef.current === controller
          ) {
            generationAbortRef.current = null;
          }
        }
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: activeEngine.id,
          prompt: finalPrompt,
          images: images.map((image) => image.dataUrl.split(',')[1]), // strip data: prefix
          config,
          featureId: feature.id,
          apiKey: activeProvider ? providerKeys[activeProvider] : apiKey,
          model: activeProviderModel ?? undefined,
          cfAccountId,
          cfToken,
        }),
      });

      const data = await response.json();

      if (data.success && data.imageData) {
        const mime: string = data.mimeType || 'image/png';
        const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
        return {
          dataUrl: `data:${mime};base64,${data.imageData}`,
          ext,
          mimeType: mime,
          usage: data.usage,
          cost: typeof data.cost === 'number' ? data.cost : undefined,
        };
      }

      const debugInfo = data.debug ? ` (${data.debug})` : '';
      const detailsInfo = data.details ? `\n\nDetails: ${data.details}` : '';
      throw new RouteError(
        (data.error || 'Failed to generate image') + debugInfo + detailsInfo,
        response.status
      );
    },
    onSuccess: (result) => {
      autoRetry.reset();
      toast.success('Image generated');
      playGenerationChime();
      resultIdRef.current += 1;
      setResults((current) => [
        {
          id: `result-${resultIdRef.current}`,
          src: result.dataUrl,
          mimeType: result.mimeType,
        },
        // Kept whole rather than sliced here: ResultStack owns the display cap,
        // and the library holds everything regardless.
        ...current,
      ]);
      // Images are small enough to keep every time. The provider URL fal hands
      // back expires in a week, so the bytes are what make this durable.
      void captureImage(result.dataUrl).then((galleryRecordId) =>
        captureImageResult({
          engine: activeEngine.id,
          modelId: activeModelId,
          prompt,
          inputImages: images.length,
          resolution: config.imageSize,
          usage: result.usage,
          cost: result.cost,
          galleryRecordId,
          falApiKey,
          webSearch: Boolean(config.useGoogleSearch),
        })
      );
    },
    onError: (e) => {
      if (e instanceof LocalFalCancellation) return;
      const message = e instanceof Error ? e.message : 'Generation failed';
      // Sent again only when the request never reached a decision — a bad key,
      // an empty balance, or a content-policy refusal would fail identically
      // five more times, and the retry would only bury the reason.
      const retrying = isRetryableFailure(e) && autoRetry.schedule(() => generateRef.current());
      toast.error(retrying ? `${message} Retrying in ${AUTO_RETRY_DELAY_SECONDS}s.` : message);
    },
  });

  const captureImage = async (result: string): Promise<string | undefined> => {
    try {
      const blob = await resultBlob(result, 'image');
      const record = await useGalleryStore.getState().record({
        kind: 'image',
        prompt,
        slug: filenameSlug ?? undefined,
        provider: activeEngine.id,
        modelId: activeModelId,
        controlValues: {
          aspect_ratio: config.aspectRatio ?? '16:9',
          resolution: config.imageSize ?? '1K',
        },
        mimeType: blob.type || 'image/png',
        sourceUrl: result.startsWith('data:') ? undefined : result,
        blob,
      });
      return record?.id;
    } catch {
      // A result that cannot be filed is still on screen and downloadable;
      // failing to archive it must not read as a failed generation.
      return undefined;
    }
  };

  // Generate a fresh, feature-tailored example prompt via gemini-2.5-flash-lite.
  const exampleMutation = useMutation({
    mutationFn: () => requestExamplePrompt(feature.id, apiKey),
    onSuccess: (p) => {
      setPrompt(p);
      setFilenameSlug(null);
      void prerenderSlug(p); // pre-render the download filename for this example
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Could not generate example');
      if (feature.examplePrompt) setPrompt(feature.examplePrompt); // graceful fallback
    },
  });

  const handleUseExample = () => {
    // Served by the shared micro-AI tier or the user's own key; onError falls
    // back to the static example, so the button always leaves a usable prompt.
    exampleMutation.mutate();
  };

  // Derived view state from the mutation.
  const isGenerating = generateMutation.isPending || cloudSubmitting;
  const newestResult = results[0] ?? null;
  // Feeds the format control's "Auto → …" hint, so it names the real outcome
  // for these bytes rather than assuming a PNG source.
  const generatedMimeType = newestResult?.mimeType ?? 'image/png';
  const displayError =
    error ||
    (!cloudWorkspace.cloud && generateMutation.error instanceof Error &&
    !(generateMutation.error instanceof LocalFalCancellation)
      ? generateMutation.error.message
      : null);

  // Cost line, per engine. Gemini's rate is the single table in lib/spend/rates.ts —
  // that file names the vendor page it was read from. Pollinations is free.
  const estCost = geminiResolutionCost(config.imageSize, images.length);
  // Aggregator prices are the vendors' published rates, carried on the catalog
  // entry — the units differ per provider, so they are shown as written rather
  // than folded into one estimate.
  const activeProviderCatalogModel =
    activeProvider && activeProviderModel
      ? modelsFor(activeProvider, 'image').find((model) => model.id === activeProviderModel)
      : undefined;
  const costLine =
    activeEngine.id === 'pollinations'
      ? cloudWorkspace.cloud ? 'Provider usage rates apply · Pollinations (FLUX)' : 'Free · Pollinations (FLUX)'
      : activeEngine.id === 'cloudflare'
        ? 'Free daily tier · FLUX.1 [schnell]'
        : activeEngine.id === 'fal'
          ? 'fal usage rates apply · Nano Banana 2'
          : activeProviderCatalogModel
            ? `${activeProviderCatalogModel.price ?? 'Usage rates apply'} · ${activeProviderCatalogModel.label}`
            : `Est. ≈ $${estCost.toFixed(2)} / image · Gemini 3 Pro Image`;

  useEffect(() => {
    generateRef.current = () => generateMutation.mutate();
  });

  const handleGenerate = async () => {
    if (cloudWorkspace.checking || cloudSubmitting) return;
    // A deliberate press is a fresh start: it drops any queued attempt and hands
    // back the full retry budget.
    autoRetry.reset();
    const hasFeatureDefaultPrompt =
      feature.id === 'image-editing' || feature.id === 'style-transfer';
    if (!prompt.trim() && !hasFeatureDefaultPrompt) {
      setError('Please enter a prompt');
      return;
    }
    if (feature.requiresImage && images.length === 0) {
      setError('Please upload at least one image');
      return;
    }
    if (cloudWorkspace.cloud) {
      if (!cloudWorkspace.connected) {
        setError(`Save your ${activeEngine.label} connection in your account first.`);
        onOpenConnections(activeEngine.id);
        return;
      }
      const operation = generationOperationRef.current;
      setError(null);
      setCloudSubmitting(true);
      try {
        const cloudPrompt = featureImagePrompt(feature.id, prompt, references.length) || 'Edit this image while preserving its subject and composition.';
        const values: Record<string,string|number|boolean> = activeEngine.id === 'fal'
          ? {aspect_ratio:config.aspectRatio ?? 'auto',resolution:config.imageSize ?? '1K',enable_web_search:Boolean(config.useGoogleSearch)}
          : activeProvider || activeEngine.id === 'pollinations'
            ? {aspectRatio:config.aspectRatio ?? '16:9'}
            : activeEngine.id === 'cloudflare' ? {}
              : {aspectRatio:config.aspectRatio ?? '16:9',imageSize:config.imageSize ?? '1K',useGoogleSearch:Boolean(config.useGoogleSearch)};
        await cloudWorkspace.submit({modelId:cloudModelId,mediaType:'image',inputMode:cloudInputMode,prompt:cloudPrompt,values},feature.requiresImage ? references.map(reference => reference.file) : []);
      } catch (caught) {
        if (mountedRef.current && generationOperationRef.current === operation) setError(caught instanceof Error ? caught.message : 'Could not confirm this background job.');
      } finally {
        if (mountedRef.current) setCloudSubmitting(false);
      }
      return;
    }
    if (activeEngine.id === 'cloudflare' && !hasCfCreds) {
      setError('Connect your Cloudflare account first — add your Account ID and API token in API connections.');
      onOpenConnections('cloudflare');
      return;
    }
    if (activeEngine.id === 'fal' && !falApiKey.trim()) {
      setError('Connect your fal API key first in API connections.');
      onOpenConnections('fal');
      return;
    }
    if (activeProvider && !providerKeys[activeProvider].trim()) {
      setError(`Connect your ${activeEngine.label} key first in API connections.`);
      onOpenConnections(activeProvider);
      return;
    }
    setError(null);
    // Manual / edited prompt with no pre-rendered slug → generate one in
    // parallel with the image so the download has a meaningful name.
    if (prompt.trim() && !filenameSlug) {
      void prerenderSlug(prompt);
    }
    usePromptLibraryStore.getState().remember(prompt);
    generateMutation.mutate();
  };

  const abortActiveGeneration = () => {
    generationOperationRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  };

  const abortActiveDownload = () => {
    downloadOperationRef.current += 1;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
  };

  const handleEngineSelect = (engineId: EngineId) => {
    abortActiveGeneration();
    abortActiveDownload();
    setEngine(engineId);
  };

  const handleBack = () => {
    abortActiveGeneration();
    abortActiveDownload();
    onBack();
  };

  /**
   * Saves the card that was clicked, not whatever is newest.
   *
   * The abort bookkeeping stays one-at-a-time: a second click supersedes the
   * first regardless of which card it came from.
   */
  const downloadImage = async (item: ResultStackItem | null) => {
    const generatedImage = item?.src;
    if (!generatedImage) return;

    downloadAbortRef.current?.abort();
    const operationId = downloadOperationRef.current + 1;
    downloadOperationRef.current = operationId;
    downloadAbortRef.current = null;
    setError(null);
    setDownloadingId(item.id);

    const base = downloadFilenameBase({
      prompt,
      mediaType: 'image',
      slug: filenameSlug || slugify(prompt) || `scene-assembly-${feature.id}`,
      provider: activeEngine.id,
      modelId: activeModelId,
    });

    if (generatedImage.startsWith('data:image/')) {
      // Decoded rather than handed straight to the anchor, so the chosen format
      // applies here too — this is the path nano banana's PNG results take.
      // A decode failure falls back to the original direct-anchor download:
      // saving the result must not depend on converting it.
      try {
        const saved = await convertedForDownload(blobFromDataUrl(generatedImage), imageFormat);
        const objectUrl = URL.createObjectURL(saved);
        try {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `${base}.${extensionForMimeType(saved.type)}`;
          link.click();
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `${base}.${extensionForMimeType(item.mimeType ?? generatedMimeType)}`;
        link.click();
      } finally {
        setDownloadingId(null);
      }
      return;
    }

    if (!isSafeFalMediaUrl(generatedImage)) {
      setError(DOWNLOAD_ERROR);
      setDownloadingId(null);
      return;
    }

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    let objectUrl: string | null = null;
    const isCurrentOperation = () =>
      mountedRef.current &&
      !controller.signal.aborted &&
      downloadOperationRef.current === operationId &&
      downloadAbortRef.current === controller;

    try {
      const response = await fetch(generatedImage, { signal: controller.signal });
      if (!isCurrentOperation()) return;

      const responseMime = normalizedMimeType(response.headers.get('Content-Type'));
      if (!response.ok || !SUPPORTED_RASTER_MIMES.has(responseMime)) {
        throw new Error(DOWNLOAD_ERROR);
      }

      const blob = await boundedMediaBlob(
        response,
        responseMime,
        controller.signal,
        MAX_REMOTE_IMAGE_BYTES
      );
      if (!isCurrentOperation()) return;

      const saved = await convertedForDownload(blob, imageFormat);
      if (!isCurrentOperation()) return;

      objectUrl = URL.createObjectURL(saved);

      const link = document.createElement('a');
      link.href = objectUrl;
      // From the saved blob, never the response header: a browser that cannot
      // encode the chosen format leaves the original bytes, and the name must
      // follow the bytes.
      link.download = `${base}.${extensionForMimeType(saved.type)}`;
      link.click();
    } catch (caught) {
      if (!isCurrentOperation() || isAbortError(caught)) return;
      setError(DOWNLOAD_ERROR);
      controller.abort();
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (
        downloadOperationRef.current === operationId &&
        downloadAbortRef.current === controller
      ) {
        downloadAbortRef.current = null;
      }
      if (mountedRef.current) setDownloadingId((current) => (current === item.id ? null : current));
    }
  };

  if (activeEngine.id === 'kie') {
    return (
      <KieGenerationWorkspace
        mediaType="image"
        inputMode={feature.requiresImage ? 'image' : 'text'}
        title={feature.name}
        initialPrompt={feature.examplePrompt}
        exampleFeatureId={feature.id}
        engineSelector={
          <EngineSelector
            engines={availableEngines}
        accountMode={cloudWorkspace.cloud}
            activeEngineId={activeEngine.id}
            onSelect={handleEngineSelect}
          />
        }
        onBack={handleBack}
        onOpenConnections={onOpenConnections}
      />
    );
  }

  // Special prompt templates for social media
  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-3 sm:space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-3.5 md:p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={handleBack}
              className="btn-secondary text-xs sm:text-sm py-2 px-3 sm:px-4 flex-shrink-0"
            >
              ← Back
            </button>
            {/* Title only: the feature's card copy sells the mode on the landing
                page, and repeating it over the controls of a mode already chosen
                is noise. The emoji goes with it — decoration at 36px. */}
            <div className="min-w-0">
              <h2 className="display truncate text-base font-semibold sm:text-lg md:text-xl">
                {feature.name}
              </h2>
            </div>
          </div>
        </div>
      </motion.div>

      <EngineSelector
        engines={availableEngines}
        accountMode={cloudWorkspace.cloud}
        activeEngineId={activeEngine.id}
        onSelect={handleEngineSelect}
      />

      <CloudExecutionNotice workspace={cloudWorkspace} />

      {/* Same shape as the Model card in the Kie and fal workspaces: a select
          of what this provider serves, with the vendor's own description of the
          chosen one underneath. */}
      {activeProvider && (
        <section className="glass-card space-y-3 p-3.5 md:p-4">
          <h3 className="display text-base font-semibold">Model</h3>
          <div className="space-y-2">
            <label htmlFor="provider-model" className="sr-only">
              Model
            </label>
            <select
              id="provider-model"
              aria-label="Model"
              value={activeProviderModel ?? ''}
              onChange={(event) => setProviderModel(activeProvider, 'image', event.target.value)}
              className="w-full"
            >
              {modelsFor(activeProvider, 'image').map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                  {model.price ? ` · ${model.price}` : ''}
                </option>
              ))}
            </select>
            {activeProviderCatalogModel && (
              <p className="px-0.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  {activeProviderCatalogModel.label}:
                </span>{' '}
                {activeProviderCatalogModel.note ??
                  `Billed to your ${activeEngine.label} account at ${activeProviderCatalogModel.price ?? 'the vendor’s rates'}.`}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
        {/* Input Section */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-3 sm:space-y-3.5 md:space-y-4"
        >
          {/* Image Upload */}
          {feature.requiresImage && (
            <div className="glass-card p-3.5 md:p-4 space-y-3">
              <h3 className="display text-base sm:text-lg font-semibold">
                Upload Image{feature.requiresMultipleImages ? 's' : ''}
              </h3>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple={feature.requiresMultipleImages}
                onChange={handleImageUpload}
                className="hidden"
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  {...dropProps}
                  className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-3 transition-all sm:flex-1 ${isDragging ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]' : 'border-[var(--neon-cyan)]/30 text-[var(--foreground-muted)] hover:border-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/5 hover:text-[var(--neon-cyan)]'}`}
                >
                  {isFetching ? <Loader2 size={32} className="animate-spin" /> : <ImagePlus size={32} />}
                  <span className="font-medium">
                    {isFetching
                      ? 'Fetching dropped image…'
                      : isDragging
                        ? 'Drop to use as a source'
                        : `Drop or click to upload${feature.requiresMultipleImages ? ` (max ${feature.maxImages})` : ''}`}
                  </span>
                  <span className="text-xs text-[var(--foreground-subtle)]">
                    or paste with ⌘V / Ctrl+V
                  </span>
                </button>
                {references.length < (feature.maxImages || 1) && (
                  <StoredImagePicker referenceLimit={feature.maxImages || 1} />
                )}
              </div>

              {images.length > 0 && (
                <ReferenceStack
                  items={images.map((image, index) => ({
                    id: image.id,
                    src: image.dataUrl,
                    alt: `Upload ${index + 1}`,
                    removeLabel: `Remove upload ${index + 1}`,
                  }))}
                  onRemove={removeImage}
                />
              )}
            </div>
          )}

          {/* Prompt Input */}
          <PromptPanel>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="display text-base sm:text-lg font-semibold">
                Prompt
              </h3>
              <div className="flex items-center gap-1.5">
                {feature.examplePrompt && (
                  <button
                    onClick={handleUseExample}
                    disabled={exampleMutation.isPending}
                    className="text-xs text-[var(--brand-accent)] hover:text-[var(--neon-cyan)] disabled:opacity-60 flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 transition-colors"
                  >
                    {exampleMutation.isPending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Thinking…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Gen Example
                      </>
                    )}
                  </button>
                )}

                {/* Reveal the exact instruction Gemini is given */}
                <div className="relative inline-flex group/tip">
                  <button
                    type="button"
                    aria-label="What Gemini is asked to produce"
                    className="text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] cursor-help p-1"
                  >
                    <Info size={14} />
                  </button>
                  <div className="pointer-events-none absolute right-0 top-full mt-2 w-72 sm:w-80 z-30 opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 transition-opacity duration-150 rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-3 text-left shadow-[var(--shadow-md)]">
                    <p className="eyebrow mb-1.5">Gemini is asked</p>
                    <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
                      {metaForFeature(feature.id)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <AutoExpandingPrompt
              aria-label="Prompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setFilenameSlug(null); // manual edit invalidates the pre-rendered name
              }}
              placeholder={
                feature.id === 'social-media-thumbnail'
                  ? 'Describe the subject, emotion, and action'
                  : 'Describe the image'
              }
            />

            {feature.id === 'social-media-thumbnail' && (
              <div className="p-3 rounded-lg bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 text-sm">
                <p className="text-[var(--brand-accent)] font-semibold mb-1">💡 Pro Tip:</p>
                <p className="text-[var(--foreground-muted)]">
                  Describe the emotion and action you want! The AI will automatically add dramatic effects,
                  bold text, and viral thumbnail styling.
                </p>
              </div>
            )}
          </PromptPanel>

          {/* Settings Panel — always visible */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4 space-y-3"
          >
                <h3 className="display text-lg font-semibold">
                  Generation Settings
                </h3>

                <div className="space-y-3">
                  {activeEngine.id === 'cloudflare' && !hasCfCreds && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Connect your Cloudflare token to use this engine.
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenConnections(activeEngine.id)}
                        className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0"
                      >
                        Connect →
                      </button>
                    </div>
                  )}

                  {activeEngine.id === 'fal' && !falApiKey.trim() && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Connect your fal API key to use this engine.
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenConnections(activeEngine.id)}
                        className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0"
                      >
                        Connect →
                      </button>
                    </div>
                  )}

                  {activeEngine.supportsAspectRatio && (
                  <div>
                    <label htmlFor="image-aspect-ratio" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                      Aspect Ratio
                    </label>
                    <select
                      id="image-aspect-ratio"
                      value={config.aspectRatio}
                      onChange={(e) => applyConfig({ ...config, aspectRatio: e.target.value as NonNullable<GenerationConfig['aspectRatio']> })}
                      className="w-full"
                    >
                      {ASPECT_RATIO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  )}

                  {activeEngine.supportsImageSize && (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-[var(--foreground)]">
                      Resolution
                    </span>
                    <SegmentedToggleGroup
                      label="Resolution"
                      options={RESOLUTION_OPTIONS}
                      value={config.imageSize ?? '1K'}
                      onChange={(value) => applyConfig({
                        ...config,
                        imageSize: value as NonNullable<GenerationConfig['imageSize']>,
                      })}
                    />
                  </div>
                  )}

                  {feature.id === 'search-grounding' && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div>
                        <span className="text-sm font-medium">Use Google Search</span>
                        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                          Ground generation with real-time data
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.useGoogleSearch}
                        onChange={(e) => applyConfig({ ...config, useGoogleSearch: e.target.checked })}
                        className="w-5 h-5"
                      />
                    </div>
                  )}
                </div>
          </motion.div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || cloudWorkspace.checking}
            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={24} />
                Generating Magic...
              </>
            ) : (
              <>
                <Wand2 size={24} />
                Generate Image
              </>
            )}
          </button>

          <p className="mt-2 text-center text-xs text-[var(--foreground-subtle)]">
            {costLine}
          </p>

          {/* Error Display */}
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-4 bg-red-500/10 border-red-500/30 text-red-300 whitespace-pre-wrap"
              >
                {displayError}
                <RetryCountdown retry={autoRetry.pending} onCancel={autoRetry.cancel} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Output Section */}
        {cloudWorkspace.cloud ? <CloudJobPanel provider={activeEngine.id} modelId={cloudModelId} mediaType="image" inputMode={cloudInputMode} /> : <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-4 space-y-3"
        >
          <h3 className="display text-lg font-semibold">
            Generated Image
          </h3>

          {newestResult && (
            <ImageFormatControl
              value={imageFormat}
              onChange={setImageFormat}
              sourceMimeType={generatedMimeType}
            />
          )}

          <ResultStack
            items={results}
            isGenerating={isGenerating}
            onDownload={(item) => downloadImage(item)}
            downloadingId={downloadingId}
            downloadLabel="Download Image"

            emptyState={
              <div className="p-5 text-center text-[var(--foreground-muted)]">
                <Wand2 size={48} className="mx-auto mb-4 opacity-30" />
                <p>Your generated image will appear here</p>
              </div>
            }
          />
        </motion.div>}
      </div>
    </div>
  );
}
