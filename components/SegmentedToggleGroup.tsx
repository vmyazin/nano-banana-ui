'use client';

export interface SegmentedToggleOption {
  label: string;
  value: string | number;
}

interface SegmentedToggleGroupProps {
  label: string;
  options: readonly SegmentedToggleOption[];
  value: string | number;
  onChange: (value: string | number) => void;
}

export default function SegmentedToggleGroup({
  label,
  options,
  value,
  onChange,
}: SegmentedToggleGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full items-center gap-2">
      {options.map((option) => {
        const selected = String(option.value) === String(value);

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] ${
              selected
                ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]'
                : 'border-[var(--border)] bg-[var(--background-elevated)]/60 text-[var(--foreground-muted)] hover:border-[var(--border-hover)] hover:text-[var(--foreground)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
