'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Download, ImagePlus, Loader2, Search, Sparkles, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';

import LastFrameActions from '@/components/LastFrameActions';
import AutoExpandingPrompt from '@/components/AutoExpandingPrompt';
import ModelControls, { type ModelControlField } from '@/components/ModelControls';
import ProviderLogo from '@/components/ProviderLogo';
import StoredImagePicker from '@/components/StoredImagePicker';
import GenerationWorkspaceLayout from '@/components/GenerationWorkspaceLayout';
import { candidatesFromSizes, useAutoAspect } from '@/lib/draft/aspect-match';
import { carryOverValues } from '@/lib/draft/carry-over';
import { useFileDrop } from '@/lib/drop/use-file-drop';
import { recordFinishedJob } from '@/lib/gallery/record-job';
import {
  downloadRemoteMedia,
  extensionForMedia,
  isDownloadableMediaUrl,
} from '@/lib/media-download';
import { downloadFilenameBase } from '@/lib/download-name';
import { requestExamplePrompt, requestPromptSlug } from '@/lib/micro-ai/browser';
import { getProviderVideoStatus, pollDelayMs, submitProviderVideo } from '@/lib/providers/browser';
import { modelsFor } from '@/lib/providers/catalog';
import { frameSlotLabel } from '@/lib/providers/frames';
import type { ProviderId, ProviderMode, ProviderModel } from '@/lib/providers/types';
import { FRAME_EXTRACTION_ERROR, isVideoFile, lastFrameAsImageFile } from '@/lib/video-frame';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';
import { usePromptLibraryStore } from '@/store/usePromptLibraryStore';
import { useProviderJobsStore, type ProviderJob } from '@/store/useProviderJobsStore';
import { useSeedFrameStore } from '@/store/useSeedFrameStore';

/**
 * Video for Runware, Atlas Cloud, and CometAPI, laid out the way the Kie and
 * fal workspaces already are: one header, a left column of setup inputs and a
 * right column with Prompt above Result. The shared
 * pieces are literally shared — the draft store, the drop-and-paste handling,
 * the micro-AI example and slug helpers, ModelControls, LastFrameActions — so a
 * prompt or a reference image survives switching providers.
 */
interface ProviderVideoWorkspaceProps {
  provider: ProviderId;
  label: string;
  /**
   * 'frames' is first-and-last: two images, in order. Runware's models that
   * accept two `frameImages` document exactly that reading for a pair, so it
   * needs no positioning beyond the order they are sent in.
   */
  inputMode: ProviderMode;
  onBack: () => void;
  onOpenConnections: () => void;
  /** Switch this workspace to image-to-video, for continuing from a last frame. */
  onContinueFromFrame?: () => void;
}

/** A job stops polling after this many attempts (~7 minutes at the top delay). */
const MAX_POLL_ATTEMPTS = 60;

const isTerminal = (state: ProviderJob['state']) => state === 'success' || state === 'error';

/**
 * The vendor's own constraints, rendered through the same control component the
 * Kie and fal workspaces use. Duration and size are per model — a length or a
 * width/height the model does not publish is rejected outright — so the options
 * come from the catalog entry rather than from a fixed list.
 */
function controlFieldsFor(model: ProviderModel | undefined): ModelControlField[] {
  if (!model) return [];
  const fields: ModelControlField[] = [];

  if (model.duration?.type === 'range') {
    fields.push({
      key: 'duration',
      label: 'Duration',
      type: 'number',
      description: `${model.duration.min}–${model.duration.max} whole seconds.`,
      defaultValue: model.duration.default,
      min: model.duration.min,
      max: model.duration.max,
      step: 1,
    });
  } else if (model.duration?.type === 'options') {
    fields.push({
      key: 'duration',
      label: 'Duration',
      type: 'select',
      defaultValue: model.duration.values[0],
      options: model.duration.values.map((seconds) => ({
        label: `${seconds} seconds`,
        value: seconds,
      })),
    });
  } else if (model.durations?.length) {
    fields.push({
      key: 'duration',
      label: 'Duration',
      type: 'select',
      defaultValue: model.durations[0],
      options: model.durations.map((seconds) => ({ label: `${seconds} seconds`, value: seconds })),
    });
  }
  if (model.sizes?.length) {
    fields.push({
      key: 'size',
      label: 'Output size',
      type: 'select',
      description: 'Only the combinations this model publishes.',
      defaultValue: model.sizes[0].label,
      options: model.sizes.map((size) => ({ label: size.label, value: size.label })),
    });
  }
  return fields;
}

function defaultValuesFor(fields: ModelControlField[]): Record<string, string | number | boolean> {
  return Object.fromEntries(
    fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue as string | number | boolean])
  );
}

/** References are held as Files; every provider here wants a data URI. */
function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

export default function ProviderVideoWorkspace({
  provider,
  label,
  inputMode,
  onBack,
  onOpenConnections,
  onContinueFromFrame,
}: ProviderVideoWorkspaceProps) {
  const geminiApiKey = useAppStore((state) => state.apiKey);
  const runwareApiKey = useAppStore((state) => state.runwareApiKey);
  const atlasApiKey = useAppStore((state) => state.atlasApiKey);
  const cometApiKey = useAppStore((state) => state.cometApiKey);
  const runwareVideoModel = useAppStore((state) => state.runwareVideoModel);
  const atlasVideoModel = useAppStore((state) => state.atlasVideoModel);
  const cometVideoModel = useAppStore((state) => state.cometVideoModel);
  const setProviderModel = useAppStore((state) => state.setProviderModel);

  const apiKey =
    provider === 'runware' ? runwareApiKey : provider === 'atlas' ? atlasApiKey : cometApiKey;
  const preference =
    provider === 'runware'
      ? runwareVideoModel
      : provider === 'atlas'
        ? atlasVideoModel
        : cometVideoModel;

  // Models that cannot take the current input mode are filtered out rather than
  // failing at the vendor — Runware's Wan 2.6 Flash, for one, is image-only.
  const models = useMemo(
    () => modelsFor(provider, 'video').filter((model) => model.modes.includes(inputMode)),
    [inputMode, provider]
  );
  const selectedModel = models.find((model) => model.id === preference) ?? models[0];
  const modelKey = `${provider}:${selectedModel?.id ?? 'none'}`;
  const fields = useMemo(() => controlFieldsFor(selectedModel), [selectedModel]);

  const prompt = useDraftStore((state) => state.prompt);
  const setPrompt = useDraftStore((state) => state.setPrompt);
  const references = useDraftStore((state) => state.references);
  const controlValues = useDraftStore((state) => state.controlValues);
  const [valuesByModel, setValuesByModel] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});
  const values =
    valuesByModel[modelKey] ?? carryOverValues(fields, defaultValuesFor(fields), controlValues);

  const [modelSearch, setModelSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReadingFrame, setIsReadingFrame] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Latest addReferences, so the paste listener attaches once instead of per render.
  const addReferencesRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  const mountedRef = useRef(true);
  const isFrames = inputMode === 'frames';
  const isReference = inputMode === 'reference';
  const inputCapability = inputMode === 'text' ? undefined : selectedModel?.videoInputs?.[inputMode];
  // Reference arrays can be larger at the provider, but data-URI requests stay
  // practical at five views. The server still enforces the documented hard max.
  const maxInputImages = isFrames
    ? 2
    : isReference
      ? (inputCapability?.clientMaxImages ?? Math.min(inputCapability?.maxImages ?? 5, 5))
      : (inputCapability?.maxImages ?? selectedModel?.maxInputImages ?? 1);
  const referenceToken = (index: number) =>
    inputCapability?.promptSyntax === 'at-image-index' ? `@Image${index + 1}` : `Image ${index + 1}`;
  const matchingModels = models.filter((model) =>
    `${model.label} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const allJobs = useProviderJobsStore((state) => state.jobs);
  const patchJob = useProviderJobsStore((state) => state.patchJob);
  const latestJob = allJobs.find(
    (job) =>
      job.provider === provider && job.modelId === selectedModel?.id && job.inputMode === inputMode
  );
  const resultUrl = latestJob?.state === 'success' ? latestJob.urls[0] : undefined;

  // Claim a frame handed over by "Continue from last frame".
  useEffect(() => {
    if (inputMode === 'text' || isReference) return;
    const seed = useSeedFrameStore.getState().takeSeedFrame();
    if (!seed) return;
    const draft = useDraftStore.getState();
    draft.clearReferences();
    draft.addReferences(
      [{ file: seed.file, sourceLabel: `Last frame of ${seed.sourceLabel.replace(/-/g, ' ')}` }],
      1
    );
    if (!draft.prompt) {
      draft.setPrompt(`Continue the scene from ${seed.sourceLabel.replace(/-/g, ' ')}.`);
    }
  }, [inputMode, isReference]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A stricter model must not keep more references than it accepts.
  useEffect(() => {
    useDraftStore.getState().limitReferences(maxInputImages);
  }, [maxInputImages]);

  useEffect(() => {
    if (inputMode === 'text') return;

    const onPaste = (event: ClipboardEvent) => {
      const pastedFiles = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith('image/') || isVideoFile(file)
      );
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      void addReferencesRef.current(pastedFiles);
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [inputMode]);

  const updateValues = (key: string, value: string | number | boolean) => {
    setValuesByModel((current) => ({ ...current, [modelKey]: { ...values, [key]: value } }));
    // Remembered globally so the next model inherits whatever it can express.
    useDraftStore.getState().rememberControlValues({ [key]: value });
  };

  // Adding a reference (or the first frame) snaps "Output size" to the entry
  // in this model's whitelist closest to that image's shape.
  const sizeCandidates = useMemo(
    () => candidatesFromSizes(selectedModel?.sizes ?? []),
    [selectedModel]
  );
  useAutoAspect(references[0], sizeCandidates, (value) => {
    if (value !== values.size) updateValues('size', value);
  });

  const addReferences = async (files: File[]) => {
    const usable = files.filter((file) =>
      isReference ? file.type.startsWith('image/') : file.type.startsWith('image/') || isVideoFile(file)
    );
    if (usable.length === 0) {
      setError(
        isReference
          ? 'Choose an image for this character reference.'
          : 'Choose an image, or a video to continue from its last frame.'
      );
      return;
    }
    if (references.length + usable.length > maxInputImages) {
      setError(
        isReference
          ? `Add up to ${maxInputImages} character views for this generation.`
          : `This model accepts up to ${maxInputImages} reference image${maxInputImages === 1 ? '' : 's'}.`
      );
      return;
    }

    setError(null);
    const hasVideo = usable.some(isVideoFile);
    if (hasVideo) setIsReadingFrame(true);
    try {
      // A picked video stands in for its final frame, so a clip saved earlier
      // can seed the next one without a round trip through a provider.
      const prepared = await Promise.all(
        usable.map(async (file) =>
          isVideoFile(file)
            ? { file: await lastFrameAsImageFile(file), sourceLabel: `Last frame of ${file.name}` }
            : { file, sourceLabel: undefined }
        )
      );
      if (!mountedRef.current) return;
      useDraftStore.getState().addReferences(prepared, maxInputImages);
    } catch {
      if (mountedRef.current) setError(FRAME_EXTRACTION_ERROR);
    } finally {
      if (mountedRef.current && hasVideo) setIsReadingFrame(false);
    }
  };

  useEffect(() => {
    addReferencesRef.current = addReferences;
  });

  const isPickerFull = references.length >= maxInputImages;
  const { isDragging, isFetching, dropProps } = useFileDrop({
    onFiles: (files) => addReferencesRef.current(files),
    onError: setError,
    disabled: isPickerFull,
  });

  const removeReference = (index: number) => {
    const reference = references[index];
    if (reference) useDraftStore.getState().removeReference(reference.id);
  };

  // Served by the shared micro-AI tier when the deployment has one, otherwise by
  // the user's own Gemini key; the route says which when neither is available.
  const generateExample = async () => {
    setIsGeneratingExample(true);
    setError(null);
    try {
      setPrompt(
        await requestExamplePrompt(
          inputMode === 'text' ? 'text-to-video' : 'image-to-video',
          geminiApiKey
        )
      );
    } catch (exampleError) {
      const message =
        exampleError instanceof Error ? exampleError.message : 'Could not generate an example prompt.';
      setError(message);
      toast.error(message);
    } finally {
      setIsGeneratingExample(false);
    }
  };

  // Ask flash-lite for a short evocative filename slug and pin it to the job, so
  // the download is named after the prompt rather than the provider's task ID.
  const attachSlug = async (jobId: string, jobPrompt: string) => {
    const slug = await requestPromptSlug(jobPrompt, geminiApiKey);
    if (slug) patchJob(jobId, { slug });
  };

  const pollJob = async (job: ProviderJob) => {
    let attempt = job.pollAttempt;
    try {
      while (attempt < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, pollDelayMs(attempt)));
        attempt += 1;
        const task = await getProviderVideoStatus({
          provider,
          apiKey,
          taskId: job.taskId as string,
        });
        patchJob(job.id, {
          state: task.state,
          progress: task.progress,
          urls: task.urls,
          cost: task.cost,
          error: task.error,
          pollAttempt: attempt,
        });

        if (task.state === 'success') {
          const current = useProviderJobsStore.getState().jobs.find((entry) => entry.id === job.id);
          recordFinishedJob(
            provider,
            {
              id: job.id,
              mediaType: 'video',
              prompt: job.prompt,
              slug: current?.slug,
              modelId: job.modelId,
              inputMode: job.inputMode,
              controlValues: job.controlValues,
              mimeType: 'video/mp4',
            },
            task.urls[0]
          );
          toast.success('Video ready');
          return;
        }
        if (task.state === 'error') {
          toast.error(task.error || `${label} could not finish this video.`);
          return;
        }
      }
      patchJob(job.id, {
        state: 'error',
        error: `${label} is taking longer than expected. Check your provider dashboard for this task.`,
      });
    } catch (cause) {
      patchJob(job.id, {
        state: 'error',
        error: cause instanceof Error ? cause.message : 'Polling failed.',
      });
    }
  };

  const filenameBase = latestJob
    ? downloadFilenameBase({
        prompt: latestJob.prompt,
        mediaType: 'video',
        slug: latestJob.slug,
        provider,
        modelId: latestJob.modelId,
      })
    : '';

  const downloadResult = async () => {
    if (!latestJob || !resultUrl) return;
    if (!isDownloadableMediaUrl(resultUrl)) {
      setError(`This ${label} result URL has expired and can no longer be downloaded.`);
      return;
    }

    setError(null);
    setIsDownloading(true);
    try {
      await downloadRemoteMedia({
        url: resultUrl,
        mediaType: 'video',
        filenameBase,
      });
    } finally {
      if (mountedRef.current) setIsDownloading(false);
    }
  };

  const submit = async () => {
    if (!apiKey.trim()) {
      setError(`Connect your ${label} key before starting a generation.`);
      onOpenConnections();
      return;
    }
    if (!selectedModel) {
      setError(`${label} has no model for this mode.`);
      return;
    }
    if (!prompt.trim()) {
      setError('Describe the clip you want before generating.');
      return;
    }
    if (inputMode === 'image' && references.length === 0) {
      setError('Add the image this clip should start from.');
      return;
    }
    if (isReference && references.length === 0) {
      setError('Add at least one character view.');
      return;
    }
    if (isFrames && references.length < 2) {
      setError('Add both frames — the first, then the last.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const images = await Promise.all(references.map((reference) => fileAsDataUrl(reference.file)));
      const submittedPrompt = prompt.trim();
      const taskId = await submitProviderVideo({
        provider,
        apiKey,
        model: selectedModel.id,
        prompt: submittedPrompt,
        inputMode,
        images,
        durationSeconds: typeof values.duration === 'number' ? values.duration : undefined,
        size: typeof values.size === 'string' ? values.size : undefined,
      });
      usePromptLibraryStore.getState().remember(submittedPrompt);
      const jobId = useProviderJobsStore.getState().startJob({
        provider,
        taskId,
        modelId: selectedModel.id,
        prompt: submittedPrompt,
        inputMode,
        controlValues: values,
        state: 'queued',
        urls: [],
      });
      // Runs alongside the generation so the name is ready before the result is.
      void attachSlug(jobId, submittedPrompt);
      const started = useProviderJobsStore.getState().jobs.find((job) => job.id === jobId);
      if (started) void pollJob(started);
      toast.success('Task queued.');
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : `${label} could not start this task.`;
      setError(message);
      toast.error(message);
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3.5 sm:space-y-4">
      <section className="glass-card p-3.5 md:p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button type="button" onClick={onBack} className="btn-secondary shrink-0 px-3 py-2 text-sm">
              ← Back
            </button>
            <div className="min-w-0">
              <div className="eyebrow mb-1 flex items-center gap-1.5 text-[var(--neon-purple)]">
                <ProviderLogo provider={provider} size={13} /> {label}
              </div>
              <h2 className="display text-lg font-semibold text-[var(--foreground)] sm:text-xl">
                {isFrames
                  ? 'First & last frame to video'
                  : isReference
                    ? 'Character references'
                    : `${inputMode === 'text' ? 'Text' : 'Image'} to video`}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenConnections}
            className="btn-secondary shrink-0 px-3 py-2 text-xs"
          >
            {apiKey ? `${label} key connected` : `Connect ${label} key`}
          </button>
        </div>
      </section>

      <GenerationWorkspaceLayout
        setup={
          <>
          <section className="glass-card space-y-3 p-3.5 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="display text-base font-semibold">Model</h3>
              <div className="flex w-40 max-w-[48%] items-center gap-2">
                <Search
                  className="pointer-events-none shrink-0 text-[var(--foreground-subtle)]"
                  size={14}
                />
                <input
                  aria-label="Search compatible models"
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Find a model"
                  className="min-w-0 flex-1 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="provider-video-model" className="sr-only">
                Model
              </label>
              <select
                id="provider-video-model"
                aria-label="Model"
                value={selectedModel?.id ?? ''}
                onChange={(event) => {
                  setError(null);
                  setProviderModel(provider, 'video', event.target.value);
                }}
                className="w-full"
              >
                {(matchingModels.length > 0 ? matchingModels : models).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                    {model.price ? ` · ${model.price}` : ''}
                  </option>
                ))}
              </select>
              {selectedModel && (
                <p className="px-0.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  <span className="font-medium text-[var(--foreground)]">{selectedModel.label}:</span>{' '}
                  {selectedModel.note ??
                    `Billed to your ${label} account at ${selectedModel.price ?? 'the vendor’s rates'}.`}
                </p>
              )}
            </div>
          </section>

          {inputMode !== 'text' && (
            <section className="glass-card space-y-3 p-3.5 md:p-4">
              <div>
                <h3 className="display text-base font-semibold">
                  {isFrames
                    ? 'First and last frame'
                    : isReference
                      ? 'Add character views'
                      : `Reference image${maxInputImages === 1 ? '' : 's'}`}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  {isFrames
                    ? 'Two images, in order: the frame the clip opens on, then the one it ends on. The model builds the motion between them.'
                    : isReference
                      ? `Add up to ${maxInputImages} front, three-quarter, or profile views. Their order becomes ${referenceToken(0)}, ${referenceToken(1)}, and so on in your prompt.`
                      : `Upload up to ${maxInputImages}; files are forwarded to ${label} only for this task. Pick a saved clip and its last frame is used.`}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={isReference ? 'image/*' : 'image/*,video/*'}
                multiple={maxInputImages > 1}
                className="hidden"
                onChange={(event) => {
                  void addReferences(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              {!isPickerFull && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    {...dropProps}
                    className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-3.5 text-sm transition-colors sm:flex-1 ${isDragging ? 'border-[var(--neon-purple)] bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]' : 'border-[var(--neon-purple)]/30 text-[var(--foreground-muted)] hover:border-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/5 hover:text-[var(--neon-purple)]'}`}
                  >
                    {isReadingFrame || isFetching ? (
                      <Loader2 className="animate-spin" size={28} />
                    ) : (
                      <ImagePlus size={28} />
                    )}
                    {isReadingFrame
                      ? 'Reading last frame…'
                      : isFetching
                        ? 'Fetching dropped image…'
                        : isDragging
                          ? 'Drop to use as a source'
                          : isReference
                            ? 'Drop, upload, or paste character views'
                            : 'Drop, upload, or paste an image or video'}
                  </button>
                  {references.length < maxInputImages && (
                    <StoredImagePicker referenceLimit={maxInputImages} />
                  )}
                </div>
              )}
              {references.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {references.map((reference, index) => (
                    <div key={reference.id} className="space-y-1">
                      {isFrames && (
                        <p className="text-[0.65rem] font-medium text-[var(--neon-purple)]">
                          {frameSlotLabel(index)}
                        </p>
                      )}
                      {isReference && (
                        <p className="text-[0.65rem] font-medium text-[var(--neon-purple)]">
                          {referenceToken(index)}
                        </p>
                      )}
                      <div className="group relative overflow-hidden rounded-lg border border-[var(--border)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never a remote asset */}
                        <img
                          src={reference.previewUrl}
                          alt={
                            isFrames
                              ? frameSlotLabel(index)
                              : isReference
                                ? `Image ${index + 1} character reference`
                                : `Reference ${index + 1}`
                          }
                          className="aspect-square w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(index)}
                          aria-label={
                            isFrames
                              ? `Remove ${frameSlotLabel(index).toLowerCase()}`
                              : isReference
                                ? `Remove Image ${index + 1}`
                                : `Remove reference ${index + 1}`
                          }
                          className="absolute right-2 top-2 rounded-md border border-white/10 bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {reference.sourceLabel && (
                        <p
                          title={reference.sourceLabel}
                          className="truncate text-[0.65rem] text-[var(--foreground-subtle)]"
                        >
                          {reference.sourceLabel}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Which image opens the clip and which closes it is the whole of
                  this mode, and picking them in the wrong order is a two-file
                  re-upload without this. */}
              {isFrames && references.length === 2 && (
                <button
                  type="button"
                  onClick={() => useDraftStore.getState().reorderReference(0, 1)}
                  className="btn-secondary flex w-full items-center justify-center gap-2 text-sm"
                >
                  <ArrowUpDown size={15} /> Swap first and last
                </button>
              )}
            </section>
          )}

          {fields.length > 0 && (
            <section className="glass-card space-y-3 p-3.5 md:p-4">
              <div>
                <h3 className="display text-base font-semibold">Model controls</h3>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Only the lengths and sizes {selectedModel?.label} publishes are offered.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ModelControls
                  namespace={`provider-${modelKey}`}
                  fields={fields}
                  values={values}
                  onChange={updateValues}
                />
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={21} /> Starting…
              </>
            ) : (
              <>
                <Sparkles size={21} /> Generate video
              </>
            )}
          </button>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          </>
        }
        prompt={
          <section className="glass-card space-y-3 p-3.5 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="provider-video-prompt" className="display block text-base font-semibold">
                Prompt
              </label>
              <button
                type="button"
                onClick={() => void generateExample()}
                disabled={isGeneratingExample}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--brand-accent)] transition-colors hover:text-[var(--neon-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
                title="Generate an example prompt with the shared fast model, or your own Gemini key"
              >
                {isGeneratingExample ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {isGeneratingExample ? 'Thinking…' : 'Gen Example'}
              </button>
            </div>
            <AutoExpandingPrompt
              id="provider-video-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the motion, camera, mood, and scene…"
            />
          </section>
        }
        results={
          <section className="glass-card flex min-h-[420px] flex-col gap-4 p-3.5 md:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="display text-base font-semibold">Result</h3>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                Results are temporary — download anything you want to keep.
              </p>
              {/* The result on screen belongs to this model — the same name the
                  download is tagged with. */}
              {latestJob && selectedModel && (
                <p className="mt-0.5 text-xs text-[var(--foreground-subtle)]">{selectedModel.label}</p>
              )}
            </div>
            {latestJob && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs ${latestJob.state === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : latestJob.state === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}
              >
                {latestJob.state === 'queued'
                  ? 'Queued'
                  : latestJob.state === 'running'
                    ? 'Generating'
                    : latestJob.state === 'success'
                      ? `Done${latestJob.cost !== undefined ? ` · $${latestJob.cost.toFixed(3)}` : ''}`
                      : 'Failed'}
              </span>
            )}
          </div>
          <div className="flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]/70">
            {resultUrl ? (
              <video
                src={resultUrl}
                controls
                playsInline
                className="h-full max-h-[520px] w-full bg-black"
              />
            ) : latestJob && !isTerminal(latestJob.state) ? (
              <div className="space-y-3 p-5 text-center">
                <Loader2 className="mx-auto animate-spin text-[var(--neon-purple)]" size={34} />
                <p className="text-sm text-[var(--foreground-muted)]">
                  {label} is working on your video.
                </p>
                {typeof latestJob.progress === 'number' && (
                  <p className="font-mono text-xs text-[var(--neon-purple)]">
                    {Math.round(latestJob.progress * 100)}%
                  </p>
                )}
              </div>
            ) : latestJob?.state === 'error' ? (
              <p className="max-w-sm p-5 text-center text-sm text-red-300">
                {latestJob.error || `${label} could not complete this task. It was not resubmitted.`}
              </p>
            ) : (
              <div className="p-5 text-center text-[var(--foreground-muted)]">
                <Video className="mx-auto mb-3 opacity-35" size={46} />
                <p>Your generated video will appear here.</p>
              </div>
            )}
          </div>
          {resultUrl && latestJob && (
            <a
              href={resultUrl}
              download={`${filenameBase}.${extensionForMedia('video')}`}
              onClick={(event) => {
                // Results are served cross-origin, where the download attribute is
                // ignored — fetch the bytes so the semantic name survives.
                event.preventDefault();
                void downloadResult();
              }}
              className="btn-secondary flex w-full items-center justify-center gap-2"
            >
              {isDownloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
              {isDownloading ? 'Preparing download…' : 'Download video'}
            </a>
          )}
          {resultUrl && latestJob && (
            <LastFrameActions
              videoUrl={resultUrl}
              filenameBase={filenameBase}
              onContinue={onContinueFromFrame}
            />
          )}
          </section>
        }
      />
    </div>
  );
}
