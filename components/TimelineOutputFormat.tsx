'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Settings2 } from 'lucide-react';

import type { TimelineOutput } from '@/store/useTimelineStore';

/**
 * The output format, shown and editable.
 *
 * The project owner's choice was "the timeline picks a sensible target from
 * what's on it and shows it as an editable output setting", paired with the
 * per-clip crop override. The crop half shipped first; this is the other half.
 * Without it `output.auto` could never become false, so the store's `setOutput`
 * had no caller and the "match clips" affordance was unreachable.
 *
 * Every value is constrained on commit rather than trusted as typed — see
 * `constrainDimension`, which is what keeps a hand-entered odd number from
 * reaching an encoder that would reject it.
 */

/** Small enough to be a thumbnail, large enough for 8K; both engines cope. */
export const MIN_DIMENSION = 16;
export const MAX_DIMENSION = 7680;
export const MIN_FPS = 1;
export const MAX_FPS = 240;

/**
 * A width or height the encoders will actually accept.
 *
 * Both engines encode H.264 in yuv420p, which requires even dimensions —
 * libx264 refuses "width not divisible by 2" outright and WebCodecs rejects
 * the config. `deriveOutputFormat` already guarantees that for the automatic
 * value; a hand-typed 1921 would break both engines identically, so it is
 * rounded *down* here (never up: growing the frame to satisfy the codec would
 * upscale the source).
 */
export function constrainDimension(value: number): number {
  const clamped = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
  return Math.floor(clamped / 2) * 2;
}

/**
 * A framerate both engines can use. Deliberately not forced to an integer:
 * NTSC rates (23.976, 29.97) are exactly what `deriveOutputFormat` derives
 * from real Veo output, and rounding them to 24/30 would reintroduce the
 * uneven cadence the framerate probe exists to avoid.
 */
export function constrainFps(value: number): number {
  const clamped = Math.min(MAX_FPS, Math.max(MIN_FPS, value));
  return Number(clamped.toFixed(3));
}

interface TimelineOutputFormatProps {
  output: TimelineOutput;
  /** Any committed edit; the store freezes `auto` in response. */
  onEdit: (patch: Partial<Omit<TimelineOutput, 'auto'>>) => void;
  onMatchClips: () => void;
}

type Field = 'width' | 'height' | 'fps';

const INPUT_CLASS =
  'w-[4.5rem] rounded-md border border-[var(--border)] bg-[var(--background-elevated)]/60 px-1.5 py-0.5 ' +
  'text-right text-[0.8125rem] tabular-nums text-[var(--foreground)] outline-none ' +
  'focus:border-[var(--neon-cyan)]/60';

export default function TimelineOutputFormat({ output, onEdit, onMatchClips }: TimelineOutputFormatProps) {
  // Drafts are strings so a half-typed "19" on the way to "1920" is not
  // clamped out from under the cursor. They are only interpreted on commit.
  const [draft, setDraft] = useState(() => ({
    width: String(output.width),
    height: String(output.height),
    fps: String(output.fps),
  }));

  // The store is also written from outside this component — the auto recompute
  // as clips arrive, and "match clips" — so the draft follows it whenever the
  // committed value changes.
  useEffect(() => {
    setDraft({ width: String(output.width), height: String(output.height), fps: String(output.fps) });
  }, [output.width, output.height, output.fps]);

  const commit = (field: Field) => {
    const raw = draft[field];
    const current = output[field];
    const parsed = Number(raw);

    // Empty or nonsense is not an edit, it is a slip: put the committed value
    // back and leave `auto` alone rather than freezing the format on a typo.
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setDraft((prev) => ({ ...prev, [field]: String(current) }));
      return;
    }

    const next = field === 'fps' ? constrainFps(parsed) : constrainDimension(parsed);
    setDraft((prev) => ({ ...prev, [field]: String(next) }));

    // Compared against what was typed, not against the constrained result: a
    // hand-entered 1921 constrains back to 1920 and still counts as an edit
    // (the user meant to take control), while tabbing through a field without
    // touching it does not silently freeze the automatic format.
    if (raw !== String(current)) onEdit({ [field]: next });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const field = (name: Field, label: string, step: string) => (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={name === 'fps' ? MIN_FPS : MIN_DIMENSION}
      max={name === 'fps' ? MAX_FPS : MAX_DIMENSION}
      step={step}
      value={draft[name]}
      onChange={(event) => setDraft((prev) => ({ ...prev, [name]: event.target.value }))}
      onBlur={() => commit(name)}
      onKeyDown={onKeyDown}
      className={INPUT_CLASS}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.8125rem] text-[var(--foreground-muted)]">
      <span className="flex items-center gap-1.5">
        <Settings2 size={13} className="text-[var(--foreground-subtle)]" aria-hidden />
        Output
      </span>
      {field('width', 'Output width', '2')}
      <span aria-hidden>×</span>
      {field('height', 'Output height', '2')}
      <span>@</span>
      {field('fps', 'Output frames per second', '1')}
      <span>fps</span>
      {output.auto ? (
        <span className="pill">auto</span>
      ) : (
        <button
          type="button"
          onClick={onMatchClips}
          className="text-[var(--neon-cyan)] underline-offset-2 hover:underline"
        >
          match clips
        </button>
      )}
    </div>
  );
}
