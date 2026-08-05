'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, ImagePlus, Loader2, Search, Sparkles, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { requestExamplePrompt } from '@/lib/example-prompts';
import { submitKieJob, uploadKieFiles } from '@/lib/kie/browser';
import { defaultKieValues, modelsForKieMode, resolveKieVariant, validateKieInput } from '@/lib/kie/catalog';
import { currentKieTime, isKieJobTerminal } from '@/lib/kie/queue';
import type { KieFieldDefinition, KieInputMode, MediaType } from '@/lib/kie/types';
import {
  downloadRemoteMedia,
  extensionForMedia,
  fallbackFilenameBase,
  isDownloadableMediaUrl,
  requestPromptSlug,
} from '@/lib/media-download';
import { useAppStore } from '@/store/useAppStore';
import { useKieJobsStore } from '@/store/useKieJobsStore';
import ModelControls, { type ModelControlField } from '@/components/ModelControls';

interface KieGenerationWorkspaceProps {
  mediaType: MediaType;
  inputMode: KieInputMode;
  onBack: () => void;
  onOpenConnections: () => void;
  title?: string;
  description?: string;
  initialPrompt?: string;
  exampleFeatureId?: string;
  engineSelector?: ReactNode;
}

interface UploadedReference {
  file: File;
  previewUrl: string;
}

type KieModelControlField = Omit<KieFieldDefinition, 'type'> & {
  type: ModelControlField['type'];
};

const isKieModelControlField = (field: KieFieldDefinition): field is KieModelControlField =>
  field.type !== 'file';

const titleFor = (mediaType: MediaType, inputMode: KieInputMode) =>
  `${inputMode === 'text' ? 'Text' : 'Image'} to ${mediaType}`;

function modelPreferenceKey(mediaType: MediaType): 'kieImageModel' | 'kieVideoModel' {
  return mediaType === 'image' ? 'kieImageModel' : 'kieVideoModel';
}

export default function KieGenerationWorkspace({
  mediaType,
  inputMode,
  onBack,
  onOpenConnections,
  title,
  description,
  initialPrompt = '',
  exampleFeatureId,
  engineSelector,
}: KieGenerationWorkspaceProps) {
  const geminiApiKey = useAppStore((state) => state.apiKey);
  const kieApiKey = useAppStore((state) => state.kieApiKey);
  const kieImageModel = useAppStore((state) => state.kieImageModel);
  const kieVideoModel = useAppStore((state) => state.kieVideoModel);
  const setKieImageModel = useAppStore((state) => state.setKieImageModel);
  const setKieVideoModel = useAppStore((state) => state.setKieVideoModel);
  const jobs = useKieJobsStore((state) => state.jobs);
  const upsertJob = useKieJobsStore((state) => state.upsertJob);

  const models = useMemo(() => modelsForKieMode(mediaType, inputMode), [inputMode, mediaType]);
  const preference = mediaType === 'image' ? kieImageModel : kieVideoModel;
  const selectedModel = models.find((model) => model.id === preference) ?? models[0];
  const variant = resolveKieVariant(selectedModel.id, inputMode);
  const variantKey = `${selectedModel.id}:${inputMode}`;
  const [valuesByVariant, setValuesByVariant] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});
  const values = valuesByVariant[variantKey] ?? defaultKieValues(variant);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [references, setReferences] = useState<UploadedReference[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referencesRef = useRef<UploadedReference[]>([]);
  const mountedRef = useRef(true);
  const maxInputImages = variant.maxInputImages ?? 1;
  const matchingModels = models.filter((model) =>
    `${model.label} ${model.provider}`.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const latestJob = jobs.find(
    (job) => job.modelId === selectedModel.id && job.mediaType === mediaType && job.inputMode === inputMode
  );
  const resultUrl = latestJob?.state === 'success' ? latestJob.resultUrls[0] : undefined;
  const resolvedExampleFeatureId =
    exampleFeatureId ?? (mediaType === 'video' ? `${inputMode}-to-video` : 'text-to-image');

  useEffect(() => {
    referencesRef.current = references;
  }, [references]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      referencesRef.current.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (inputMode !== 'image') return;

    const onPaste = (event: ClipboardEvent) => {
      const pastedFiles = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/')
      );
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      if (references.length + pastedFiles.length > maxInputImages) {
        setError(`This model accepts up to ${maxInputImages} reference image${maxInputImages === 1 ? '' : 's'}.`);
        return;
      }
      setReferences((current) => [
        ...current,
        ...pastedFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
      setError(null);
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [inputMode, maxInputImages, references.length]);

  const updateValues = (key: string, value: string | number | boolean) => {
    setValuesByVariant((current) => ({
      ...current,
      [variantKey]: { ...values, [key]: value },
    }));
  };

  const setModel = (modelId: string) => {
    setError(null);
    const setter = modelPreferenceKey(mediaType) === 'kieImageModel' ? setKieImageModel : setKieVideoModel;
    setter(modelId);
  };

  const addReferences = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Choose an image file supported by the selected Kie model.');
      return;
    }
    if (references.length + imageFiles.length > maxInputImages) {
      setError(`This model accepts up to ${maxInputImages} reference image${maxInputImages === 1 ? '' : 's'}.`);
      return;
    }
    setReferences((current) => [
      ...current,
      ...imageFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    setError(null);
  };

  const removeReference = (index: number) => {
    setReferences((current) => {
      const reference = current[index];
      if (reference) URL.revokeObjectURL(reference.previewUrl);
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const generateExample = async () => {
    if (!geminiApiKey) return;

    setIsGeneratingExample(true);
    setError(null);
    try {
      setPrompt(await requestExamplePrompt(resolvedExampleFeatureId, geminiApiKey));
    } catch (exampleError) {
      const message = exampleError instanceof Error
        ? exampleError.message
        : 'Could not generate an example prompt.';
      setError(message);
      toast.error(message);
    } finally {
      setIsGeneratingExample(false);
    }
  };

  // Ask flash-lite for a short evocative filename slug and pin it to the job, so
  // the download is named after the prompt rather than the provider's task ID.
  // Fire-and-forget — downloadResult() falls back to a client-side slug.
  const attachSlug = async (jobId: string, jobPrompt: string) => {
    const slug = await requestPromptSlug(jobPrompt, geminiApiKey);
    if (!slug) return;
    const latest = useKieJobsStore.getState().jobs.find((job) => job.id === jobId);
    if (!latest || latest.slug) return;
    upsertJob({ ...latest, slug });
  };

  const downloadResult = async () => {
    if (!latestJob || !resultUrl) return;
    if (!isDownloadableMediaUrl(resultUrl)) {
      setError('This Kie result URL has expired and can no longer be downloaded.');
      return;
    }

    setError(null);
    setIsDownloading(true);
    try {
      await downloadRemoteMedia({
        url: resultUrl,
        mediaType,
        filenameBase: latestJob.slug || fallbackFilenameBase(latestJob.prompt, mediaType),
      });
    } finally {
      if (mountedRef.current) setIsDownloading(false);
    }
  };

  const submit = async () => {
    if (!kieApiKey) {
      setError('Connect your Kie API key before starting a generation.');
      onOpenConnections();
      return;
    }
    const inputError = validateKieInput(variant, {
      prompt,
      uploadUrls: references.map((reference) => reference.previewUrl),
    });
    if (inputError) {
      setError(inputError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const uploadUrls = await uploadKieFiles(kieApiKey, references.map((reference) => reference.file));
      const { taskId, protocol } = await submitKieJob({
        apiKey: kieApiKey,
        modelId: selectedModel.id,
        mediaType,
        inputMode,
        prompt: prompt.trim(),
        uploadUrls,
        values,
      });
      const now = currentKieTime();
      const submittedPrompt = prompt.trim();
      upsertJob({
        id: taskId,
        taskId,
        protocol,
        state: 'queuing',
        resultUrls: [],
        modelId: selectedModel.id,
        mediaType,
        inputMode,
        prompt: submittedPrompt,
        createdAt: now,
        updatedAt: now,
        pollAttempt: 0,
      });
      // Runs alongside the generation so the name is ready before the result is.
      void attachSlug(taskId, submittedPrompt);
      toast.success('Kie task queued. You can keep using the studio while it runs.');
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'Kie could not start this task.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 sm:space-y-6">
      <section className="glass-card p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button type="button" onClick={onBack} className="btn-secondary shrink-0 px-3 py-2 text-sm">
              ← Back
            </button>
            <div className="min-w-0">
              <div className="eyebrow mb-1 flex items-center gap-1.5 text-[var(--neon-cyan)]">
                {mediaType === 'video' ? <Video size={13} /> : <Sparkles size={13} />} Kie.ai BYOK
              </div>
              <h2 className="display text-xl font-semibold text-[var(--foreground)] sm:text-2xl">
                {title ?? titleFor(mediaType, inputMode)}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
                {description ?? `Choose a verified Kie ${mediaType} model, configure its supported controls, and create a temporary result.`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onOpenConnections} className="btn-secondary shrink-0 px-3 py-2 text-xs">
            {kieApiKey ? 'Kie key connected' : 'Connect Kie key'}
          </button>
        </div>
      </section>

      {engineSelector}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="space-y-5">
          <section className="glass-card space-y-4 p-4 sm:p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="display text-lg font-semibold">Compatible model</h3>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{models.length} verified {mediaType} model families for this flow</p>
              </div>
              <div className="flex w-40 max-w-[48%] items-center gap-2">
                <Search className="pointer-events-none shrink-0 text-[var(--foreground-subtle)]" size={14} />
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
              <label htmlFor="kie-model" className="sr-only">Model</label>
              <select
                id="kie-model"
                aria-label="Model"
                value={selectedModel.id}
                onChange={(event) => setModel(event.target.value)}
                className="w-full"
              >
                {(matchingModels.length > 0 ? matchingModels : models).map((model) => (
                  <option key={model.id} value={model.id}>{model.label} · {model.provider}</option>
                ))}
              </select>
              <p className="px-0.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                <span className="font-medium text-[var(--foreground)]">{selectedModel.label}:</span> {selectedModel.description}
              </p>
            </div>
          </section>

          {inputMode === 'image' && (
            <section className="glass-card space-y-4 p-4 sm:p-5 md:p-6">
              <div>
                <h3 className="display text-lg font-semibold">Reference image{maxInputImages === 1 ? '' : 's'}</h3>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Upload up to {maxInputImages}; files are forwarded to Kie only for this task.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple={maxInputImages > 1}
                className="hidden"
                onChange={(event) => {
                  addReferences(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--neon-cyan)]/30 py-5 text-sm text-[var(--foreground-muted)] transition-colors hover:border-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/5 hover:text-[var(--neon-cyan)]"
              >
                <ImagePlus size={28} />
                Upload image or paste from clipboard
              </button>
              {references.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {references.map((reference, index) => (
                    <div key={reference.previewUrl} className="group relative overflow-hidden rounded-lg border border-[var(--border)]">
                      <img src={reference.previewUrl} alt={`Reference ${index + 1}`} className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReference(index)}
                        aria-label={`Remove reference ${index + 1}`}
                        className="absolute right-2 top-2 rounded-md border border-white/10 bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="glass-card space-y-3 p-4 sm:p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="kie-prompt" className="display block text-lg font-semibold">Prompt</label>
              {geminiApiKey && (
                <button
                  type="button"
                  onClick={() => void generateExample()}
                  disabled={isGeneratingExample}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--brand-accent)] transition-colors hover:text-[var(--neon-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
                  title="Generate an example prompt with your connected Gemini key"
                >
                  {isGeneratingExample ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  {isGeneratingExample ? 'Thinking…' : 'Gen Example'}
                </button>
              )}
            </div>
            <textarea
              id="kie-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={mediaType === 'video' ? 'Describe the motion, camera, mood, and scene…' : 'Describe the image you want to create…'}
              className="min-h-[150px] w-full resize-none"
            />
          </section>

          <section className="glass-card space-y-4 p-4 sm:p-5 md:p-6">
            <div>
              <h3 className="display text-lg font-semibold">Model controls</h3>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Only controls supported by {selectedModel.label} are shown.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ModelControls
                namespace={`kie-${variantKey}`}
                fields={variant.fields.filter(isKieModelControlField)}
                values={values}
                onChange={updateValues}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <><Loader2 className="animate-spin" size={21} /> Uploading & starting…</> : <><Sparkles size={21} /> Generate {mediaType}</>}
          </button>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        </div>

        <section className="glass-card flex min-h-[420px] flex-col gap-4 p-4 sm:p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="display text-lg font-semibold">Result</h3>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Kie outputs are temporary and are not stored by this app.</p>
            </div>
            {latestJob && (
              <span className={`rounded-full border px-2.5 py-1 text-xs ${latestJob.state === 'fail' ? 'border-red-500/30 bg-red-500/10 text-red-300' : latestJob.state === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                {latestJob.state === 'queuing' ? 'Queued' : latestJob.state === 'generating' ? 'Generating' : latestJob.state}
              </span>
            )}
          </div>
          <div className="flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]/70">
            {resultUrl ? (
              mediaType === 'video' ? (
                <video src={resultUrl} controls className="h-full w-full max-h-[520px] bg-black" />
              ) : (
                <img src={resultUrl} alt="Generated by Kie" className="h-full w-full object-contain" />
              )
            ) : latestJob && !isKieJobTerminal(latestJob.state) ? (
              <div className="space-y-3 p-8 text-center">
                <Loader2 className="mx-auto animate-spin text-[var(--neon-cyan)]" size={34} />
                <p className="text-sm text-[var(--foreground-muted)]">Kie is working on your {mediaType}.</p>
                {typeof latestJob.progress === 'number' && <p className="font-mono text-xs text-[var(--neon-cyan)]">{Math.round(latestJob.progress * 100)}%</p>}
              </div>
            ) : latestJob?.state === 'fail' ? (
              <p className="max-w-sm p-8 text-center text-sm text-red-300">{latestJob.error || 'Kie could not complete this task. It was not resubmitted.'}</p>
            ) : (
              <div className="p-8 text-center text-[var(--foreground-muted)]">
                {mediaType === 'video' ? <Video className="mx-auto mb-3 opacity-35" size={46} /> : <Sparkles className="mx-auto mb-3 opacity-35" size={46} />}
                <p>Your generated {mediaType} will appear here.</p>
              </div>
            )}
          </div>
          {resultUrl && latestJob && (
            <a
              href={resultUrl}
              download={`${latestJob.slug || fallbackFilenameBase(latestJob.prompt, mediaType)}.${extensionForMedia(mediaType)}`}
              onClick={(event) => {
                // Kie serves results cross-origin, where the download attribute is
                // ignored — fetch the bytes so the semantic name survives.
                event.preventDefault();
                void downloadResult();
              }}
              className="btn-secondary flex w-full items-center justify-center gap-2"
            >
              {isDownloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
              {isDownloading ? 'Preparing download…' : `Download ${mediaType}`}
            </a>
          )}
          <p className="text-center text-xs text-[var(--foreground-subtle)]">Temporary Kie URLs can expire. Download finished work immediately.</p>
        </section>
      </div>
    </div>
  );
}
