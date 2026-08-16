'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Eye, EyeOff, AlertCircle, X, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import MicroAiUsagePanel from '@/components/MicroAiUsagePanel';
import ProviderLogo from '@/components/ProviderLogo';

interface ApiKeyConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GENERIC_FAL_VALIDATION_ERROR = 'Unable to validate your fal API key.';
const PUBLIC_FAL_VALIDATION_ERRORS = new Set([
  'Your fal API key is invalid, revoked, or lacks access to this model.',
  'Your fal account needs additional credits.',
  'fal rejected one or more model settings. Review the controls and try again.',
  'fal is rate limiting requests. Please wait and try again.',
  'fal is temporarily unavailable. Please try again.',
  'fal could not complete that request.',
  'Something went wrong while contacting fal.',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One cell of the credentials grid: who the provider is, where its keys come
    from, then the fields. The URL rides inside the description as an inline
    link, so nothing competes for room on the title row. */
function ProviderCard({
  provider,
  name,
  connected,
  description,
  linkPrefix,
  href,
  urlLabel,
  className,
  children,
}: {
  provider: 'gemini' | 'kie' | 'fal' | 'cloudflare';
  name: string;
  connected: boolean;
  description: string;
  linkPrefix: string;
  href: string;
  urlLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className ?? ''}`}
    >
      <h3 className="field-label flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <ProviderLogo provider={provider} size={22} />
        {name}
        {connected && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-xs font-medium text-emerald-300">
            <Check size={13} /> Connected
          </span>
        )}
      </h3>
      <p className="field-hint">
        {description} {linkPrefix}{' '}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-[var(--neon-cyan)] hover:underline"
        >
          {/* Non-breaking space so the arrow never wraps off the URL. */}
          {`${urlLabel} →`}
        </a>
      </p>
      <div className="space-y-2.5 pt-0.5">{children}</div>
    </section>
  );
}

/** A masked credential input with its reveal toggle. */
function SecretInput({
  ariaLabel,
  toggleLabels,
  value,
  onChange,
  onEnter,
  placeholder,
  visible,
  onToggleVisible,
  disabled,
}: {
  ariaLabel?: string;
  toggleLabels: [show: string, hide: string];
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        aria-label={ariaLabel}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        placeholder={placeholder}
        className="w-full pr-11"
        disabled={disabled}
      />
      <button
        onClick={onToggleVisible}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
        type="button"
        aria-label={visible ? toggleLabels[1] : toggleLabels[0]}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

/** Inline validation failure for a single provider. */
function FieldError({ message, alert = false }: { message: string; alert?: boolean }) {
  return (
    <div
      {...(alert ? { role: 'alert' as const, 'aria-live': 'polite' as const } : {})}
      className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-[0.9375rem] leading-snug text-red-200"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function safeFalValidationError(value: unknown): string {
  if (!isRecord(value) || typeof value.error !== 'string') {
    return GENERIC_FAL_VALIDATION_ERROR;
  }

  return PUBLIC_FAL_VALIDATION_ERRORS.has(value.error)
    ? value.error
    : GENERIC_FAL_VALIDATION_ERROR;
}

export default function ApiKeyConfig({ open, onOpenChange }: ApiKeyConfigProps) {
  const savedKey = useAppStore((s) => s.apiKey);
  const setApiKey = useAppStore((s) => s.setApiKey);
  // Cloudflare creds are saved live to the store (no validation round-trip).
  const cfAccountId = useAppStore((s) => s.cfAccountId);
  const cfToken = useAppStore((s) => s.cfToken);
  const setCfAccountId = useAppStore((s) => s.setCfAccountId);
  const setCfToken = useAppStore((s) => s.setCfToken);
  const cfConnected = !!cfAccountId && !!cfToken;
  const savedKieKey = useAppStore((s) => s.kieApiKey);
  const setKieApiKey = useAppStore((s) => s.setKieApiKey);
  const kieConnected = !!savedKieKey;
  const savedFalKey = useAppStore((s) => s.falApiKey);
  const setFalApiKey = useAppStore((s) => s.setFalApiKey);
  const falConnected = !!savedFalKey;

  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showCfToken, setShowCfToken] = useState(false);
  const [kieKeyInput, setKieKeyInput] = useState('');
  const [showKieKey, setShowKieKey] = useState(false);
  const [falKeyInput, setFalKeyInput] = useState('');
  const [showFalKey, setShowFalKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [kieValidationError, setKieValidationError] = useState('');
  const [falValidationError, setFalValidationError] = useState('');
  const mountedRef = useRef(true);
  const currentOpenRef = useRef(open);
  const saveOperationRef = useRef(0);
  const savePendingRef = useRef(false);
  const falAbortControllerRef = useRef<{
    operationId: number;
    controller: AbortController;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      currentOpenRef.current = false;
      saveOperationRef.current += 1;
      savePendingRef.current = false;
      falAbortControllerRef.current?.controller.abort();
      falAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    currentOpenRef.current = open;
    if (open) return;

    saveOperationRef.current += 1;
    savePendingRef.current = false;
    falAbortControllerRef.current?.controller.abort();
    falAbortControllerRef.current = null;

    const resetId = window.setTimeout(() => {
      if (mountedRef.current && !currentOpenRef.current) {
        setIsValidating(false);
      }
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [open]);

  // Seed provider inputs with the saved keys whenever the dialog opens.
  useEffect(() => {
    if (!open) return;

    const resetId = window.setTimeout(() => {
      setKeyInput(savedKey);
      setKieKeyInput(savedKieKey);
      setFalKeyInput(savedFalKey);
      setValidationError('');
      setKieValidationError('');
      setFalValidationError('');
      if (!savePendingRef.current) {
        setIsValidating(false);
      }
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [open, savedKey, savedKieKey, savedFalKey]);

  const isOperationCurrent = (operationId: number) =>
    mountedRef.current &&
    currentOpenRef.current &&
    saveOperationRef.current === operationId;

  const validateApiKey = async (key: string, operationId: number): Promise<boolean> => {
    if (!key.startsWith('AIza') || key.length < 39) {
      if (isOperationCurrent(operationId)) {
        setValidationError('Invalid key format. Google API keys start with "AIza" and are at least 39 characters.');
      }
      return false;
    }

    setValidationError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test', images: [], config: {}, apiKey: key }),
      });
      if (!isOperationCurrent(operationId)) return false;

      const data = await response.json();
      if (!isOperationCurrent(operationId)) return false;

      if (response.ok || data.error?.includes('image data')) {
        return true;
      } else if (
        data.error?.toLowerCase().includes('api key') ||
        data.error?.toLowerCase().includes('invalid') ||
        data.details?.toLowerCase().includes('api_key_invalid')
      ) {
        setValidationError('Invalid Gemini key. Please check it and try again.');
        return false;
      } else {
        return true;
      }
    } catch {
      if (isOperationCurrent(operationId)) {
        setValidationError('Could not validate the Gemini key. Please try again.');
      }
      return false;
    }
  };

  const validateKieApiKey = async (key: string, operationId: number): Promise<boolean> => {
    if (!key.trim()) {
      if (isOperationCurrent(operationId)) {
        setKieValidationError('Enter your Kie API key.');
      }
      return false;
    }

    setKieValidationError('');
    try {
      const response = await fetch('/api/kie/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      if (!isOperationCurrent(operationId)) return false;

      const data = await response.json();
      if (!isOperationCurrent(operationId)) return false;

      if (response.ok && data.success) return true;
      setKieValidationError(data.error || 'Kie could not validate this key.');
      return false;
    } catch {
      if (isOperationCurrent(operationId)) {
        setKieValidationError('Could not reach Kie to validate this key. Please try again.');
      }
      return false;
    }
  };

  const validateFalApiKey = async (key: string, operationId: number): Promise<boolean> => {
    setFalValidationError('');
    const controller = new AbortController();
    falAbortControllerRef.current = { operationId, controller };

    try {
      const response = await fetch('/api/fal/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
        signal: controller.signal,
      });
      if (!isOperationCurrent(operationId)) return false;

      const data: unknown = await response.json();
      if (!isOperationCurrent(operationId)) return false;

      if (response.ok && isRecord(data) && data.success === true) return true;

      setFalValidationError(safeFalValidationError(data));
      return false;
    } catch {
      if (isOperationCurrent(operationId)) {
        setFalValidationError(GENERIC_FAL_VALIDATION_ERROR);
      }
      return false;
    }
  };

  // Validate + save the Gemini key (if entered), then close. Cloudflare creds
  // are already persisted as they're typed.
  const handleSave = async () => {
    if (savePendingRef.current || !currentOpenRef.current) return;

    const operationId = saveOperationRef.current + 1;
    saveOperationRef.current = operationId;
    savePendingRef.current = true;
    setIsValidating(true);

    try {
      const trimmedKey = keyInput.trim();
      if (trimmedKey && trimmedKey !== savedKey) {
        const isValid = await validateApiKey(trimmedKey, operationId);
        if (!isOperationCurrent(operationId) || !isValid) return;
        setApiKey(trimmedKey);
        toast.success('Gemini key saved');
      }

      const trimmedKieKey = kieKeyInput.trim();
      if (trimmedKieKey && trimmedKieKey !== savedKieKey) {
        const isValid = await validateKieApiKey(trimmedKieKey, operationId);
        if (!isOperationCurrent(operationId) || !isValid) return;
        setKieApiKey(trimmedKieKey);
        toast.success('Kie key validated and saved');
      }

      const trimmedFalKey = falKeyInput.trim();
      if (trimmedFalKey !== savedFalKey) {
        if (!trimmedFalKey) {
          if (!isOperationCurrent(operationId)) return;
          setFalApiKey('');
        } else {
          const isValid = await validateFalApiKey(trimmedFalKey, operationId);
          if (!isOperationCurrent(operationId) || !isValid) return;
          setFalApiKey(trimmedFalKey);
          toast.success('fal key validated and saved');
        }
      }

      if (!isOperationCurrent(operationId)) return;
      setValidationError('');
      setKieValidationError('');
      setFalValidationError('');
      onOpenChange(false);
    } finally {
      if (saveOperationRef.current === operationId) {
        savePendingRef.current = false;
        if (falAbortControllerRef.current?.operationId === operationId) {
          falAbortControllerRef.current = null;
        }
        if (mountedRef.current) {
          setIsValidating(false);
        }
      }
    }
  };

  const handleClose = () => {
    currentOpenRef.current = false;
    saveOperationRef.current += 1;
    savePendingRef.current = false;
    falAbortControllerRef.current?.controller.abort();
    falAbortControllerRef.current = null;
    setIsValidating(false);
    setValidationError('');
    setKieValidationError('');
    setFalValidationError('');
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4 md:p-6"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="API connections"
            className="dialog-panel relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden"
          >
            <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <Key className="mt-0.5 shrink-0 text-[var(--neon-cyan)]" size={18} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  API connections
                </h2>
                <p className="text-[0.9375rem] text-[var(--foreground-muted)]">
                  Add a key for any engine you want to use.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Google Gemini */}
                <ProviderCard
                  provider="gemini"
                  name="Google Gemini"
                  connected={!!savedKey}
                  description="Image and video, billed to your Google account."
                  linkPrefix="Get a key at"
                  href="https://aistudio.google.com/apikey"
                  urlLabel="aistudio.google.com/apikey"
                >
                  <SecretInput
                    ariaLabel="Gemini API key"
                    toggleLabels={['Show key', 'Hide key']}
                    value={keyInput}
                    onChange={(value) => {
                      setKeyInput(value);
                      setValidationError('');
                    }}
                    onEnter={() => void handleSave()}
                    placeholder="AIzaSy…"
                    visible={showKey}
                    onToggleVisible={() => setShowKey(!showKey)}
                    disabled={isValidating}
                  />
                  {validationError && <FieldError message={validationError} />}
                </ProviderCard>

                {/* Kie.ai */}
                <ProviderCard
                  provider="kie"
                  name="Kie.ai"
                  connected={kieConnected}
                  description="Image and video, billed to your own account. Checked against your Kie credit balance."
                  linkPrefix="Get a key at"
                  href="https://kie.ai/"
                  urlLabel="kie.ai"
                >
                  <SecretInput
                    ariaLabel="Kie API key"
                    toggleLabels={['Show Kie key', 'Hide Kie key']}
                    value={kieKeyInput}
                    onChange={(value) => {
                      setKieKeyInput(value);
                      setKieValidationError('');
                    }}
                    onEnter={() => void handleSave()}
                    placeholder="Kie API key"
                    visible={showKieKey}
                    onToggleVisible={() => setShowKieKey(!showKieKey)}
                    disabled={isValidating}
                  />
                  {kieValidationError && <FieldError message={kieValidationError} />}
                </ProviderCard>

                {/* fal.ai */}
                <ProviderCard
                  provider="fal"
                  name="fal.ai"
                  connected={falConnected}
                  description="Image and video, billed to your own account. Checked through fal pricing, so nothing billable runs."
                  linkPrefix="Get a key at"
                  href="https://fal.ai/dashboard/keys"
                  urlLabel="fal.ai/dashboard/keys"
                >
                  <SecretInput
                    ariaLabel="fal API key"
                    toggleLabels={['Show fal key', 'Hide fal key']}
                    value={falKeyInput}
                    onChange={(value) => {
                      setFalKeyInput(value);
                      setFalValidationError('');
                    }}
                    onEnter={() => void handleSave()}
                    placeholder="fal API key"
                    visible={showFalKey}
                    onToggleVisible={() => setShowFalKey(!showFalKey)}
                    disabled={isValidating}
                  />
                  {falValidationError && <FieldError message={falValidationError} alert />}
                </ProviderCard>

                {/* Cloudflare Workers AI — two fields, so it takes the full width
                    on its own row and pairs them side by side. */}
                <ProviderCard
                  provider="cloudflare"
                  name="Cloudflare"
                  connected={cfConnected}
                  description="Free text-to-image on Workers AI. Both fields save as you type."
                  linkPrefix="Create a token at"
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  urlLabel="dash.cloudflare.com/profile/api-tokens"
                  className="sm:order-2 sm:col-span-2"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="field-sublabel block" htmlFor="cf-account-id">
                        Account ID
                      </label>
                      <input
                        id="cf-account-id"
                        value={cfAccountId}
                        onChange={(e) => setCfAccountId(e.target.value.trim())}
                        placeholder="32-character account ID"
                        className="w-full font-mono text-[0.9375rem]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="field-sublabel block" htmlFor="cf-token">
                        Workers AI API token
                      </label>
                      <div className="relative">
                        <input
                          id="cf-token"
                          type={showCfToken ? 'text' : 'password'}
                          value={cfToken}
                          onChange={(e) => setCfToken(e.target.value.trim())}
                          placeholder="Workers AI API token"
                          className="w-full pr-11 font-mono text-[0.9375rem]"
                        />
                        <button
                          onClick={() => setShowCfToken(!showCfToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                          type="button"
                          aria-label={showCfToken ? 'Hide token' : 'Show token'}
                        >
                          {showCfToken ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </ProviderCard>

                {/* Fills the cell beside fal on two columns; stays last on one. */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:order-1">
                  <MicroAiUsagePanel />
                </div>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--border)] px-5 py-4 sm:px-6">
              <p className="field-hint max-w-md">
                Credentials live in this browser&apos;s local storage and go straight to each
                provider — never to our servers beyond proxying the request.
              </p>
              <button
                onClick={handleSave}
                disabled={isValidating}
                className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isValidating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Validating…
                  </>
                ) : (
                  'Save & close'
                )}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
