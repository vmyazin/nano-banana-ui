'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Eye, EyeOff, AlertCircle, X, Loader2, Cloud, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

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
            className="glass-card p-6 sm:p-7 max-w-lg w-full relative overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)] to-transparent" />

            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)] transition-colors z-10"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5 pr-10">
              <div className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--neon-cyan)]/10 flex-shrink-0">
                <Key className="text-[var(--neon-cyan)]" size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="display text-xl font-semibold text-[var(--foreground)]">
                  API connections
                </h2>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Add a key for any engine — stored only in your browser
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Google Gemini */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">Google Gemini · all modes</p>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--neon-cyan)] hover:underline"
                  >
                    Get a key →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => {
                      setKeyInput(e.target.value);
                      setValidationError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                    }}
                    placeholder="AIzaSy…"
                    className="w-full pr-11"
                    disabled={isValidating}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-colors"
                    type="button"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-400 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2"
                  >
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </motion.div>
                )}
              </section>

              {/* Kie.ai */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow flex items-center gap-1.5">
                    Kie.ai · image and video BYOK
                    {kieConnected && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 normal-case tracking-normal">
                        <Check size={12} /> connected
                      </span>
                    )}
                  </p>
                  <a
                    href="https://kie.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--neon-cyan)] hover:underline"
                  >
                    Get a key →
                  </a>
                </div>
                <div className="relative">
                  <input
                    aria-label="Kie API key"
                    type={showKieKey ? 'text' : 'password'}
                    value={kieKeyInput}
                    onChange={(event) => {
                      setKieKeyInput(event.target.value);
                      setKieValidationError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleSave();
                    }}
                    placeholder="Kie API key"
                    className="w-full pr-11"
                    disabled={isValidating}
                  />
                  <button
                    onClick={() => setShowKieKey(!showKieKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-colors"
                    type="button"
                    aria-label={showKieKey ? 'Hide Kie key' : 'Show Kie key'}
                  >
                    {showKieKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {kieValidationError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{kieValidationError}</span>
                  </div>
                )}
                <p className="text-xs text-[var(--foreground-subtle)]">
                  Validated with your Kie credit endpoint. The key stays in browser storage and is never logged or persisted by this app.
                </p>
              </section>

              {/* fal.ai */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow flex items-center gap-1.5">
                    fal.ai · image and video BYOK
                    {falConnected && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 normal-case tracking-normal">
                        <Check size={12} /> connected
                      </span>
                    )}
                  </p>
                  <a
                    href="https://fal.ai/dashboard/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--neon-cyan)] hover:underline"
                  >
                    Get a key →
                  </a>
                </div>
                <div className="relative">
                  <input
                    aria-label="fal API key"
                    type={showFalKey ? 'text' : 'password'}
                    value={falKeyInput}
                    onChange={(event) => {
                      setFalKeyInput(event.target.value);
                      setFalValidationError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleSave();
                    }}
                    placeholder="fal API key"
                    className="w-full pr-11"
                    disabled={isValidating}
                  />
                  <button
                    onClick={() => setShowFalKey(!showFalKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-colors"
                    type="button"
                    aria-label={showFalKey ? 'Hide fal key' : 'Show fal key'}
                  >
                    {showFalKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {falValidationError && (
                  <div
                    aria-live="polite"
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{falValidationError}</span>
                  </div>
                )}
                <p className="text-xs text-[var(--foreground-subtle)]">
                  Validated through fal pricing without starting a billable generation.
                </p>
              </section>

              {/* Cloudflare Workers AI */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow flex items-center gap-1.5">
                    <Cloud size={13} /> Cloudflare · free, text-to-image
                    {cfConnected && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 normal-case tracking-normal">
                        <Check size={12} /> connected
                      </span>
                    )}
                  </p>
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--neon-cyan)] hover:underline"
                  >
                    Create a token →
                  </a>
                </div>
                <input
                  value={cfAccountId}
                  onChange={(e) => setCfAccountId(e.target.value.trim())}
                  placeholder="Cloudflare Account ID"
                  className="w-full"
                />
                <div className="relative">
                  <input
                    type={showCfToken ? 'text' : 'password'}
                    value={cfToken}
                    onChange={(e) => setCfToken(e.target.value.trim())}
                    placeholder="Workers AI API token"
                    className="w-full pr-11"
                  />
                  <button
                    onClick={() => setShowCfToken(!showCfToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-colors"
                    type="button"
                    aria-label={showCfToken ? 'Hide token' : 'Show token'}
                  >
                    {showCfToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </section>

              <p className="text-xs text-[var(--foreground-subtle)] leading-relaxed">
                Credentials are stored only in your browser&apos;s local storage and sent
                directly to each provider — never to our servers beyond proxying the request.
              </p>

              <button
                onClick={handleSave}
                disabled={isValidating}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
