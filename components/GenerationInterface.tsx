// components/GenerationInterface.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Feature, GenerationConfig } from '@/types';
import { useFileDrop } from '@/lib/drop/use-file-drop';
import { metaForFeature, slugify } from '@/lib/example-prompts';
import { requestExamplePrompt, requestPromptSlug } from '@/lib/micro-ai/browser';
import {
  boundedMediaBlob,
  extensionForMimeType,
  MAX_REMOTE_IMAGE_BYTES,
  normalizedMimeType,
  SUPPORTED_RASTER_MIMES,
} from '@/lib/media-download';
import { runFalImage } from '@/lib/fal/browser';
import ProviderLogo from '@/components/ProviderLogo';
import { useAppStore } from '@/store/useAppStore';
import { modelsFor, resolveModel } from '@/lib/providers/catalog';
import type { ProviderId } from '@/lib/providers/types';
import { useDraftStore } from '@/store/useDraftStore';
import { usePromptLibraryStore } from '@/store/usePromptLibraryStore';
import { useGalleryStore } from '@/store/useGalleryStore';
import { resultBlob } from '@/lib/gallery/capture';
import { isValueCompatible, type CarryOverField } from '@/lib/draft/carry-over';
import {
  enginesForFeature,
  type EngineId,
  type EngineMeta,
} from '@/lib/engines/registry';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import SegmentedToggleGroup from '@/components/SegmentedToggleGroup';
import {
  X,
  Wand2,
  Loader2,
  Download,
  ImagePlus,
  Info,
  Maximize2,
  Sparkles,
} from 'lucide-react';

interface GenerationInterfaceProps {
  feature: Feature;
  apiKey: string;
  onBack: () => void;
  onOpenConnections: () => void;
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
  activeEngineId: EngineId;
  onSelect: (engineId: EngineId) => void;
}

function EngineSelector({ engines, activeEngineId, onSelect }: EngineSelectorProps) {
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
              title={engine.blurb}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? 'border-[var(--neon-cyan)] text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                  : 'border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
              }`}
            >
              <ProviderLogo provider={engine.id} size={13} />
              {engine.label}
              {engine.free && (
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
  const [images, setImages] = useState<string[]>([]);
  const [config, setConfig] = useState<GenerationConfig>(draftedConfig);

  // Mirrored into the draft so the video workspaces inherit the same choice.
  const applyConfig = (next: GenerationConfig) => {
    setConfig(next);
    useDraftStore.getState().rememberControlValues({
      aspect_ratio: next.aspectRatio ?? '16:9',
      resolution: next.imageSize ?? '1K',
    });
  };

  // Engines that can run this feature; fall back to the first (Gemini) if the
  // persisted choice can't (e.g. picked Pollinations then opened an editing mode).
  const storeEngine = useAppStore((s) => s.engine);
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

  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Pre-rendered, AI-summarized download filename for the current prompt.
  const [filenameSlug, setFilenameSlug] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationOperationRef = useRef(0);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadOperationRef = useRef(0);
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

    useDraftStore.getState().addReferences(imageFiles.map((file) => ({ file })), maxImages);
    setError(null);
  }, [activeEngine.id, feature.maxImages, references.length]);

  // Gemini and fal both want data URLs; the draft holds the Files, so they are
  // re-read whenever the reference list changes.
  useEffect(() => {
    let cancelled = false;
    Promise.all(references.map((reference) => readImageAsDataUrl(reference.file)))
      .then((dataUrls) => {
        if (!cancelled) setImages(dataUrls);
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

  const generateMutation = useMutation({
    mutationFn: async (): Promise<{ dataUrl: string; ext: string }> => {
      // Tailor the prompt to the feature.
      let finalPrompt = prompt;
      if (feature.id === 'social-media-thumbnail') {
        finalPrompt = `Create a VIRAL YouTube/Social Media thumbnail with these elements:
- DRAMATIC, eye-catching scene with shocked/surprised facial expression
- BIG, BOLD text overlays with key phrases (use vibrant colors like yellow, red, white)
- Arrows, circles, or highlighting elements pointing to important parts
- High contrast and saturated colors for maximum impact
- Professional editing style that screams "CLICK ME!"
- Energy and urgency in the composition

User's custom requirements: ${prompt}

Style: Photorealistic, professional thumbnail editing, viral content aesthetics`;
      } else if (feature.id === 'style-transfer') {
        if (images.length === 2) {
          finalPrompt = prompt || 'Apply the artistic style and aesthetic from the first image to the content and composition of the second image. Preserve the subject matter of the second image while adopting the color palette, brushstrokes, texture, and artistic techniques of the first image.';
        } else if (images.length === 1) {
          finalPrompt = prompt || 'Transform this image into an artistic masterpiece. Apply creative stylization while maintaining the core composition and subject matter.';
        }
      }

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
            dataUrls: images,
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
          throw new Error(FAL_GENERATION_ERROR);
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
          images: images.map((img) => img.split(',')[1]), // strip data: prefix
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
        return { dataUrl: `data:${mime};base64,${data.imageData}`, ext };
      }

      const debugInfo = data.debug ? ` (${data.debug})` : '';
      const detailsInfo = data.details ? `\n\nDetails: ${data.details}` : '';
      throw new Error((data.error || 'Failed to generate image') + debugInfo + detailsInfo);
    },
    onSuccess: (result) => {
      toast.success('Image generated');
      // Images are small enough to keep every time. The provider URL fal hands
      // back expires in a week, so the bytes are what make this durable.
      void captureImage(result.dataUrl);
    },
    onError: (e) => {
      if (e instanceof LocalFalCancellation) return;
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    },
  });

  const captureImage = async (result: string) => {
    try {
      const blob = await resultBlob(result, 'image');
      await useGalleryStore.getState().record({
        kind: 'image',
        prompt,
        slug: filenameSlug ?? undefined,
        provider: activeEngine.id,
        controlValues: {
          aspect_ratio: config.aspectRatio ?? '16:9',
          resolution: config.imageSize ?? '1K',
        },
        mimeType: blob.type || 'image/png',
        sourceUrl: result.startsWith('data:') ? undefined : result,
        blob,
      });
    } catch {
      // A result that cannot be filed is still on screen and downloadable;
      // failing to archive it must not read as a failed generation.
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
  const isGenerating = generateMutation.isPending;
  const generatedImage = generateMutation.isSuccess
    ? generateMutation.data.dataUrl
    : null;
  const downloadExt = generateMutation.data?.ext ?? 'png';
  const displayError =
    error ||
    (generateMutation.error instanceof Error &&
    !(generateMutation.error instanceof LocalFalCancellation)
      ? generateMutation.error.message
      : null);

  // Cost line, per engine. Gemini runs on gemini-3-pro-image-preview, billed at
  // $120 / 1M output tokens: 1K & 2K ≈ 1120 tokens (~$0.13), 4K ≈ 2000 tokens
  // (~$0.24); each uploaded input image ≈ 560 tokens (~$0.0011). Pollinations is free.
  const OUTPUT_COST: Record<string, number> = { '1K': 0.134, '2K': 0.134, '4K': 0.24 };
  const estCost = (OUTPUT_COST[config.imageSize ?? '1K'] ?? 0.134) + images.length * 0.0011;
  // Aggregator prices are the vendors' published rates, carried on the catalog
  // entry — the units differ per provider, so they are shown as written rather
  // than folded into one estimate.
  const activeProviderCatalogModel =
    activeProvider && activeProviderModel
      ? modelsFor(activeProvider, 'image').find((model) => model.id === activeProviderModel)
      : undefined;
  const costLine =
    activeEngine.id === 'pollinations'
      ? 'Free · Pollinations (FLUX)'
      : activeEngine.id === 'cloudflare'
        ? 'Free daily tier · FLUX.1 [schnell]'
        : activeEngine.id === 'fal'
          ? 'fal usage rates apply · Nano Banana 2'
          : activeProviderCatalogModel
            ? `${activeProviderCatalogModel.price ?? 'Usage rates apply'} · ${activeProviderCatalogModel.label}`
            : `Est. ≈ $${estCost.toFixed(2)} / image · Gemini 3 Pro Image`;

  // Close the full-screen lightbox on Escape.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  const handleGenerate = () => {
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
    if (activeEngine.id === 'cloudflare' && !hasCfCreds) {
      setError('Connect your Cloudflare account first — add your Account ID and API token in API connections.');
      onOpenConnections();
      return;
    }
    if (activeEngine.id === 'fal' && !falApiKey.trim()) {
      setError('Connect your fal API key first in API connections.');
      onOpenConnections();
      return;
    }
    if (activeProvider && !providerKeys[activeProvider].trim()) {
      setError(`Connect your ${activeEngine.label} key first in API connections.`);
      onOpenConnections();
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

  const downloadImage = async () => {
    if (!generatedImage) return;

    downloadAbortRef.current?.abort();
    const operationId = downloadOperationRef.current + 1;
    downloadOperationRef.current = operationId;
    downloadAbortRef.current = null;
    setError(null);

    const base =
      filenameSlug || slugify(prompt) || `scene-assembly-${feature.id}`;

    if (generatedImage.startsWith('data:image/')) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `${base}.${downloadExt}`;
      link.click();
      return;
    }

    if (!isSafeFalMediaUrl(generatedImage)) {
      setError(DOWNLOAD_ERROR);
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

      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${base}.${extensionForMimeType(responseMime)}`;
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
        activeEngineId={activeEngine.id}
        onSelect={handleEngineSelect}
      />

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

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                {...dropProps}
                className={`w-full py-3 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-2 ${isDragging ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]' : 'border-[var(--neon-cyan)]/30 text-[var(--foreground-muted)] hover:border-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/5 hover:text-[var(--neon-cyan)]'}`}
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

              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {images.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Upload ${index + 1}`}
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        aria-label={`Remove upload ${index + 1}`}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prompt Input */}
          <div className="glass-card p-3.5 md:p-4 space-y-3">
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

            <textarea
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
              className="w-full min-h-[150px] resize-none"
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
          </div>

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
                        onClick={onOpenConnections}
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
                        onClick={onOpenConnections}
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
            disabled={isGenerating}
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Output Section */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-4 space-y-3"
        >
          <h3 className="display text-lg font-semibold">
            Generated Image
          </h3>

          <div className="aspect-video bg-[var(--background-elevated)] rounded-xl flex items-center justify-center relative overflow-hidden">
            {isGenerating && (
              <div className="flex flex-col items-center gap-4">
                <div className="loading-spinner" />
                <p className="text-[var(--foreground-muted)] animate-pulse">
                  Creating your masterpiece...
                </p>
              </div>
            )}

            {!isGenerating && !generatedImage && (
              <div className="text-center p-5 text-[var(--foreground-muted)]">
                <Wand2 size={48} className="mx-auto mb-4 opacity-30" />
                <p>Your generated image will appear here</p>
              </div>
            )}

            {generatedImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full h-full group/img"
              >
                <img
                  src={generatedImage}
                  alt="Generated"
                  onClick={() => setLightboxOpen(true)}
                  className="w-full h-full object-contain cursor-zoom-in"
                />
                <button
                  onClick={() => setLightboxOpen(true)}
                  aria-label="View full screen"
                  className="absolute top-3 right-3 p-2 rounded-lg bg-black/55 backdrop-blur border border-white/10 text-white/80 hover:text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  <Maximize2 size={16} />
                </button>
              </motion.div>
            )}
          </div>

          {generatedImage && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => void downloadImage()}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Download Image
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Full-screen lightbox — portaled to <body> so it escapes the
          z-10 stacking context of <main> and covers the header/footer. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {lightboxOpen && generatedImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setLightboxOpen(false)}
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-5"
              >
            <button
              onClick={() => setLightboxOpen(false)}
              aria-label="Close preview"
              className="absolute top-4 right-4 p-2 rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors"
            >
              <X size={22} />
            </button>
            <motion.img
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={generatedImage}
              alt="Generated image, full size"
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                void downloadImage();
              }}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 btn-secondary flex items-center gap-2"
            >
              <Download size={18} />
              Download
            </button>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
