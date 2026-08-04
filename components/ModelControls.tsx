'use client';

import { useId } from 'react';
import SegmentedToggleGroup from '@/components/SegmentedToggleGroup';

export interface ModelControlField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'file';
  description?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string | number }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface ModelControlsProps {
  namespace: string;
  fields: ModelControlField[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
}

const safeIdPart = (value: string, fallback: string) => {
  const safeValue = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeValue || fallback;
};

export default function ModelControls({ namespace, fields, values, onChange }: ModelControlsProps) {
  const instanceId = safeIdPart(useId(), 'instance');
  const namespaceId = safeIdPart(namespace, 'controls');

  return fields.map((field) => {
    const fieldId = `model-${namespaceId}-${instanceId}-${safeIdPart(field.key, 'field')}`;
    const descriptionId = field.description ? `${fieldId}-description` : undefined;

    if (field.type === 'boolean') {
      return (
        <label key={field.key} htmlFor={fieldId} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)]/60 p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--foreground)]">{field.label}</span>
            {field.description && <span id={descriptionId} className="mt-0.5 block text-xs text-[var(--foreground-muted)]">{field.description}</span>}
          </span>
          <input
            id={fieldId}
            aria-label={field.label}
            aria-describedby={descriptionId}
            type="checkbox"
            checked={Boolean(values[field.key])}
            onChange={(event) => onChange(field.key, event.target.checked)}
            className="h-4 w-4 accent-[var(--neon-cyan)]"
          />
        </label>
      );
    }

    if (field.type === 'select' && field.key === 'resolution') {
      return (
        <div key={field.key} className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground)]">{field.label}</span>
          <SegmentedToggleGroup
            label={field.label}
            options={field.options ?? []}
            value={(values[field.key] ?? field.defaultValue ?? '') as string | number}
            onChange={(value) => onChange(field.key, value)}
          />
          {field.description && (
            <span id={descriptionId} className="block text-xs text-[var(--foreground-subtle)]">{field.description}</span>
          )}
        </div>
      );
    }

    return (
      <label key={field.key} htmlFor={fieldId} className="block space-y-1.5">
        <span className="block text-sm font-medium text-[var(--foreground)]">{field.label}</span>
        {field.type === 'select' ? (
          <select
            id={fieldId}
            aria-label={field.label}
            aria-describedby={descriptionId}
            value={String(values[field.key] ?? '')}
            onChange={(event) => {
              const option = field.options?.find(({ value }) => String(value) === event.target.value);
              onChange(field.key, option?.value ?? event.target.value);
            }}
            className="w-full"
          >
            {field.options?.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
            ))}
          </select>
        ) : field.type === 'number' ? (
          <input
            id={fieldId}
            aria-label={field.label}
            aria-describedby={descriptionId}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(values[field.key] ?? field.defaultValue ?? 0)}
            onChange={(event) => {
              if (event.target.value === '') return;
              const value = Number(event.target.value);
              if (Number.isFinite(value)) onChange(field.key, value);
            }}
            className="w-full"
          />
        ) : field.type === 'file' ? (
          <input id={fieldId} aria-label={field.label} aria-describedby={descriptionId} type="file" className="w-full" />
        ) : (
          <input
            id={fieldId}
            aria-label={field.label}
            aria-describedby={descriptionId}
            type="text"
            value={String(values[field.key] ?? '')}
            onChange={(event) => onChange(field.key, event.target.value)}
            className="w-full"
          />
        )}
        {field.description && (
          <span id={descriptionId} className="block text-xs text-[var(--foreground-subtle)]">{field.description}</span>
        )}
      </label>
    );
  });
}
