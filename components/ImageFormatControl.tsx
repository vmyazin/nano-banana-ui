'use client';

import { useEffect, useState } from 'react';

import SegmentedToggleGroup from '@/components/SegmentedToggleGroup';
import { canvasEncoder } from '@/lib/image/convert';
import {
  formatForMime,
  targetFormat,
  type ImageFormat,
  type ImageFormatPreference,
} from '@/lib/image/policy';

/**
 * The image format, shown and editable.
 *
 * Follows the "automatic, but visible" shape `TimelineOutputFormat` established:
 * Auto is the default and handles the real problem (nano banana returns PNG),
 * but the effective result is spelled out — `Auto → WebP` — because a silent
 * conversion the user cannot see is one they cannot trust.
 *
 * Formats the running browser cannot encode are hidden rather than offered and
 * quietly ignored: `canvas.toBlob` answers with a PNG instead of failing, so an
 * unsupported choice would look like it worked.
 */

const ALL_OPTIONS: ReadonlyArray<{ label: string; value: ImageFormatPreference }> = [
  { label: 'Auto', value: 'auto' },
  { label: 'PNG', value: 'png' },
  { label: 'JPG', value: 'jpeg' },
  { label: 'WebP', value: 'webp' },
];

interface ImageFormatControlProps {
  value: ImageFormatPreference;
  onChange: (value: ImageFormatPreference) => void;
  /**
   * MIME type of the bytes this will act on, when there is one on screen. Lets
   * the hint name the real outcome instead of guessing at a source.
   */
  sourceMimeType?: string;
  describedBy?: string;
}

/** What Auto will actually do to these bytes, in the user's words. */
function autoHint(sourceMimeType?: string): string {
  const format = targetFormat({
    sourceMime: sourceMimeType,
    destination: 'download',
    preference: 'auto',
  });
  if (format) return `Auto → ${format === 'jpeg' ? 'JPG' : format.toUpperCase()}`;
  const source = formatForMime(sourceMimeType);
  return source ? `Auto → keeps ${source === 'jpeg' ? 'JPG' : source.toUpperCase()}` : 'Auto → WebP';
}

export default function ImageFormatControl({
  value,
  onChange,
  sourceMimeType,
  describedBy,
}: ImageFormatControlProps) {
  const [encodable, setEncodable] = useState<ImageFormat[]>(['png', 'jpeg', 'webp']);

  useEffect(() => {
    let cancelled = false;
    // Probed in an effect, never at module scope: this bundle is prerendered on
    // the server at build time, where OffscreenCanvas does not exist.
    void Promise.all(
      (['png', 'jpeg', 'webp'] as const).map(async (format) =>
        (await canvasEncoder.supports(format)) ? format : undefined
      )
    ).then((supported) => {
      if (cancelled) return;
      const usable = supported.filter((format): format is ImageFormat => format !== undefined);
      // An empty probe means no canvas at all; keep every option rather than
      // rendering a control with nothing in it.
      if (usable.length > 0) setEncodable(usable);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = ALL_OPTIONS.filter(
    (option) => option.value === 'auto' || encodable.includes(option.value)
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">Format</span>
        {value === 'auto' ? (
          <span className="text-[0.65rem] text-[var(--foreground-subtle)]">
            {autoHint(sourceMimeType)}
          </span>
        ) : null}
      </div>
      <SegmentedToggleGroup
        label="Image format"
        ariaDescribedBy={describedBy}
        options={options}
        value={value}
        onChange={(next) => onChange(next as ImageFormatPreference)}
      />
    </div>
  );
}
