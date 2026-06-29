'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Eye, EyeOff, AlertCircle, X, Loader2, Cloud, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

interface ApiKeyConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showCfToken, setShowCfToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Seed the Gemini input with the current key whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setKeyInput(savedKey);
      setValidationError('');
    }
  }, [open, savedKey]);

  const validateApiKey = async (key: string): Promise<boolean> => {
    if (!key.startsWith('AIza') || key.length < 39) {
      setValidationError('Invalid key format. Google API keys start with "AIza" and are at least 39 characters.');
      return false;
    }

    setIsValidating(true);
    setValidationError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test', images: [], config: {}, apiKey: key }),
      });
      const data = await response.json();

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
      setValidationError('Could not validate the Gemini key. Please try again.');
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Validate + save the Gemini key (if entered), then close. Cloudflare creds
  // are already persisted as they're typed.
  const handleSave = async () => {
    const trimmedKey = keyInput.trim();
    if (trimmedKey && trimmedKey !== savedKey) {
      const isValid = await validateApiKey(trimmedKey);
      if (!isValid) return; // keep the dialog open to show the error
      setApiKey(trimmedKey);
      toast.success('Gemini key saved');
    }
    setValidationError('');
    onOpenChange(false);
  };

  const handleClose = () => {
    setValidationError('');
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
