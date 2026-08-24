import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspace, setupTimelineTest } from './helpers';
import TimelineOutputFormat, {
  constrainDimension,
  constrainFps,
} from '../../components/TimelineOutputFormat';
import { useTimelineStore, type TimelineOutput } from '../../store/useTimelineStore';

/**
 * The output format is the half of the owner's "auto-detected format with a
 * per-clip crop override" decision that shipped last. Three things have to
 * hold, and each of them was broken before this control existed: editing
 * freezes the automatic value, "match clips" both thaws it *and* recomputes
 * (the store cannot recompute on its own — it has no access to clip
 * dimensions), and a hand-typed odd dimension never reaches an encoder that
 * would reject it.
 */

const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: true };

describe('constrainDimension / constrainFps', () => {
  it('rounds an odd dimension down to even, never up', () => {
    // Down, not up: rounding 1921 to 1922 would upscale the source to satisfy
    // a codec constraint, which is a worse answer than losing one pixel.
    expect(constrainDimension(1921)).toBe(1920);
    expect(constrainDimension(1079)).toBe(1078);
    expect(constrainDimension(1920)).toBe(1920);
  });

  it('clamps to a range both engines can encode, and keeps the result even', () => {
    expect(constrainDimension(0)).toBe(16);
    expect(constrainDimension(-500)).toBe(16);
    expect(constrainDimension(99999)).toBe(7680);
    expect(constrainDimension(17.6) % 2).toBe(0);
  });

  it('keeps NTSC framerates intact rather than rounding them to integers', () => {
    // 23.976 is exactly what deriveOutputFormat derives from real Veo output;
    // rounding it to 24 would put the export back on the uneven cadence the
    // framerate probe exists to avoid.
    expect(constrainFps(23.976)).toBe(23.976);
    expect(constrainFps(29.97)).toBe(29.97);
  });

  it('clamps a framerate to a usable range', () => {
    expect(constrainFps(0.1)).toBe(1);
    expect(constrainFps(100000)).toBe(240);
  });
});

describe('TimelineOutputFormat', () => {
  beforeEach(() => setupTimelineTest());

  it('shows the derived width, height and fps as editable values', () => {
    render(<TimelineOutputFormat output={OUTPUT} onEdit={vi.fn()} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />);

    expect(screen.getByLabelText('Output width')).toHaveValue(1920);
    expect(screen.getByLabelText('Output height')).toHaveValue(1080);
    expect(screen.getByLabelText('Output frames per second')).toHaveValue(30);
  });

  it('commits an edit on blur, which is what freezes the automatic format', async () => {
    const onEdit = vi.fn();
    render(<TimelineOutputFormat output={OUTPUT} onEdit={onEdit} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />);

    const width = screen.getByLabelText('Output width');
    await userEvent.clear(width);
    await userEvent.type(width, '1280');
    await userEvent.tab();

    expect(onEdit).toHaveBeenCalledWith({ width: 1280 });
  });

  it('constrains an odd hand-typed dimension before it can reach the output', async () => {
    const onEdit = vi.fn();
    render(<TimelineOutputFormat output={OUTPUT} onEdit={onEdit} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />);

    const height = screen.getByLabelText('Output height');
    await userEvent.clear(height);
    await userEvent.type(height, '1081');
    await userEvent.tab();

    // 1081 is never what gets committed — both engines encode H.264 in
    // yuv420p, which refuses an odd dimension outright.
    expect(onEdit).toHaveBeenCalledWith({ height: 1080 });
    expect(onEdit).not.toHaveBeenCalledWith(expect.objectContaining({ height: 1081 }));
  });

  it('treats an emptied field as a slip: reverts it and does not freeze the format', async () => {
    const onEdit = vi.fn();
    render(<TimelineOutputFormat output={OUTPUT} onEdit={onEdit} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />);

    const width = screen.getByLabelText('Output width');
    await userEvent.clear(width);
    await userEvent.tab();

    expect(onEdit).not.toHaveBeenCalled();
    expect(width).toHaveValue(1920);
  });

  it('does not freeze the format when a field is tabbed through untouched', async () => {
    const onEdit = vi.fn();
    render(<TimelineOutputFormat output={OUTPUT} onEdit={onEdit} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />);

    await userEvent.click(screen.getByLabelText('Output width'));
    await userEvent.tab();

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('offers "match clips" only once the format is frozen', () => {
    const { rerender } = render(
      <TimelineOutputFormat output={OUTPUT} onEdit={vi.fn()} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /match clips/i })).not.toBeInTheDocument();

    rerender(
      <TimelineOutputFormat output={{ ...OUTPUT, auto: false }} onEdit={vi.fn()} onKeepAudioChange={vi.fn()} onMatchClips={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /match clips/i })).toBeInTheDocument();
  });

  it('offers keeping the clips own audio, ticked by default', () => {
    const onKeepAudioChange = vi.fn();
    render(
      <TimelineOutputFormat
        output={OUTPUT}
        onEdit={vi.fn()}
        onKeepAudioChange={onKeepAudioChange}
        onMatchClips={vi.fn()}
      />
    );

    const box = screen.getByRole('checkbox', { name: /keep audio/i });
    expect(box).toBeChecked();
  });

  it('reports the new value when the box is unticked', async () => {
    const onKeepAudioChange = vi.fn();
    render(
      <TimelineOutputFormat
        output={OUTPUT}
        onEdit={vi.fn()}
        onKeepAudioChange={onKeepAudioChange}
        onMatchClips={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /keep audio/i }));
    expect(onKeepAudioChange).toHaveBeenCalledWith(false);
  });
});

/**
 * The three end-to-end rules, driven through the real store and the real
 * derive effect rather than through props — the recompute bug lived in the
 * effect's dependency list, which no component-level test can see.
 */
describe('output format, end to end through the workspace', () => {
  beforeEach(() => setupTimelineTest());

  const output = () => useTimelineStore.getState().timeline.output;

  async function addAReadyClip() {
    // The mocked acquisition reports 1920x1080, so the derived format is that.
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    const list = screen.getByTestId('timeline-list');
    await waitFor(() => expect(within(list).getByText('neon tiger')).toBeInTheDocument());
    await waitFor(() => expect(output()).toMatchObject({ width: 1920, height: 1080, auto: true }));
  }

  it('freezes the derived format the moment the user edits it', async () => {
    renderWorkspace();
    await addAReadyClip();

    const width = screen.getByLabelText('Output width');
    await userEvent.clear(width);
    await userEvent.type(width, '1280');
    await userEvent.tab();

    await waitFor(() => expect(output()).toMatchObject({ width: 1280, auto: false }));
    // And it stays frozen: the derive effect no longer moves it.
    expect(output().width).toBe(1280);
  });

  it('match clips thaws the format AND recomputes it from the clips', async () => {
    renderWorkspace();
    await addAReadyClip();

    const width = screen.getByLabelText('Output width');
    await userEvent.clear(width);
    await userEvent.type(width, '640');
    await userEvent.tab();
    await waitFor(() => expect(output()).toMatchObject({ width: 640, auto: false }));

    await userEvent.click(screen.getByRole('button', { name: /match clips/i }));

    // Both halves. `matchClips` only flips the flag; the recompute has to be
    // triggered by the workspace's derive effect noticing the flag changed,
    // which it did not do before `output.auto` joined its dependency list —
    // the button thawed the format and left 640 sitting there.
    await waitFor(() => expect(output()).toMatchObject({ width: 1920, height: 1080, auto: true }));
  });

  it('never lets an odd hand-entered dimension reach the stored output', async () => {
    renderWorkspace();
    await addAReadyClip();

    const height = screen.getByLabelText('Output height');
    await userEvent.clear(height);
    await userEvent.type(height, '721');
    await userEvent.tab();

    await waitFor(() => expect(output().auto).toBe(false));
    expect(output().height).toBe(720);
    expect(output().height % 2).toBe(0);
  });

  /**
   * Sound is not part of the derived format, so it must travel through neither
   * of the two mechanisms that own the format: unticking must not freeze the
   * frame size, and the derive effect — which fires again on every clip added
   * — must not put the tick back.
   */
  it('unticking keep audio leaves the automatic format alone', async () => {
    renderWorkspace();
    await addAReadyClip();

    await userEvent.click(screen.getByRole('checkbox', { name: /keep audio/i }));

    await waitFor(() => expect(output().keepAudio).toBe(false));
    expect(output().auto).toBe(true);

    // A second clip re-runs the derive effect over the whole timeline.
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(2));
    expect(output().keepAudio).toBe(false);
  });
});
