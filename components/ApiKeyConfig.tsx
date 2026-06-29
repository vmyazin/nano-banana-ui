'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Save, Eye, EyeOff, AlertCircle, X, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

interface ApiKeyConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApiKeyConfig({ open, onOpenChange }: ApiKeyConfigProps) {
  const savedKey = useAppStore((s) => s.apiKey);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const isSaved = !!savedKey;

  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Seed the input with the current key whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setKeyInput(savedKey);
      setValidationError('');
    }
  }, [open, savedKey]);

  const validateApiKey = async (key: string): Promise<boolean> => {
    // Basic format validation for Google API keys
    if (!key.startsWith('AIza') || key.length < 39) {
      setValidationError('Invalid API key format. Google API keys start with "AIza" and are at least 39 characters.');
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
        setValidationError('Invalid API key. Please check your key and try again.');
        return false;
      } else {
        return true;
      }
    } catch {
      setValidationError('Could not validate API key. Please try again.');
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveKey = async () => {
    const trimmedKey = keyInput.trim();
    if (!trimmedKey) {
      setValidationError('Please enter an API key');
      return;
    }

    const isValid = await validateApiKey(trimmedKey);

    if (isValid) {
      // The Zustand store persists the key to localStorage.
      setApiKey(trimmedKey);
      setValidationError('');
      onOpenChange(false);
    }
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

            {/* Close button */}
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
                  {isSaved ? 'Update API key' : 'Add your API key'}
                </h2>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Connect your Google AI Studio key to generate images
                </p>
              </div>
            </div>

            <div className="mb-5 p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              <p className="eyebrow mb-2">How to get a key</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--foreground-muted)]">
                <li>
                  Visit{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[var(--neon-cyan)] hover:underline">
                    Google AI Studio
                  </a>
                </li>
                <li>Sign in and create a new Gemini API key</li>
                <li>Copy and paste it below</li>
              </ol>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setValidationError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && keyInput.trim()) handleSaveKey();
                  }}
                  placeholder="AIzaSy…"
                  className="w-full pr-11"
                  autoFocus
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

              <p className="text-xs text-[var(--foreground-subtle)] leading-relaxed">
                Stored only in your browser&apos;s local storage — never sent anywhere except Google&apos;s Gemini API.
              </p>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSaveKey}
                  disabled={!keyInput.trim() || isValidating}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Validating…
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save &amp; continue
                    </>
                  )}
                </button>
                <button onClick={handleClose} className="btn-secondary" disabled={isValidating}>
                  {isSaved ? 'Cancel' : 'Skip for now'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
