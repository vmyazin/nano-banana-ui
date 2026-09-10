import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import JobElapsed from '@/components/JobElapsed';
import { elapsedSubscriberCount, elapsedTickerActive, useElapsedSeconds } from '@/lib/jobs/use-elapsed';

/** Reads the hook's number straight out, without the component's formatting. */
function Probe({ startedAt, frozenAt }: { startedAt?: number; frozenAt?: number }) {
  const seconds = useElapsedSeconds(startedAt, { frozenAt });
  return <span data-testid="seconds">{seconds}</span>;
}

const seconds = () => screen.getByTestId('seconds').textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useElapsedSeconds', () => {
  it('counts up from the start timestamp once a second', () => {
    render(<Probe startedAt={Date.now() - 5_000} />);
    expect(seconds()).toBe('5');

    act(() => void vi.advanceTimersByTime(2_000));
    expect(seconds()).toBe('7');
  });

  it('reports the total and never ticks once frozen', () => {
    const started = Date.now() - 94_000;
    render(<Probe startedAt={started} frozenAt={started + 94_000} />);
    expect(seconds()).toBe('94');

    // The whole point of freezing: a finished job's number is a fact.
    act(() => void vi.advanceTimersByTime(10_000));
    expect(seconds()).toBe('94');
  });

  it('schedules nothing for a frozen clock', () => {
    const started = Date.now() - 30_000;
    render(<Probe startedAt={started} frozenAt={started + 30_000} />);
    expect(elapsedTickerActive()).toBe(false);
  });

  it('drives many clocks from one interval', () => {
    render(
      <>
        <Probe startedAt={Date.now() - 1_000} />
        <Probe startedAt={Date.now() - 2_000} />
        <Probe startedAt={Date.now() - 3_000} />
      </>
    );
    // A background list renders many rows; one timer must serve all of them.
    expect(elapsedSubscriberCount()).toBe(3);
    expect(elapsedTickerActive()).toBe(true);
  });

  it('stops the shared interval once the last clock unmounts', () => {
    const first = render(<Probe startedAt={Date.now() - 1_000} />);
    const second = render(<Probe startedAt={Date.now() - 1_000} />);
    expect(elapsedTickerActive()).toBe(true);

    first.unmount();
    expect(elapsedTickerActive()).toBe(true);

    second.unmount();
    expect(elapsedTickerActive()).toBe(false);
  });

  it('never goes negative when the start is in the future', () => {
    // A cloud job's createdAt comes from the Worker while now is the browser's,
    // so a client clock behind the server would otherwise render -0:03.
    render(<Probe startedAt={Date.now() + 3_000} />);
    expect(seconds()).toBe('0');
  });

  it('reports zero with no start timestamp at all', () => {
    render(<Probe startedAt={undefined} />);
    expect(seconds()).toBe('0');
    expect(elapsedTickerActive()).toBe(false);
  });

  it('picks up the current second when a clock starts running later', () => {
    // The stale-snapshot case: nothing was subscribed, so the shared `now` is
    // whatever the last tick left behind.
    const { unmount } = render(<Probe startedAt={Date.now() - 1_000} />);
    unmount();
    act(() => void vi.advanceTimersByTime(20_000));

    render(<Probe startedAt={Date.now() - 4_000} />);
    expect(seconds()).toBe('4');
  });
});

describe('server rendering', () => {
  it('renders a running clock as 0:00 rather than a value that cannot hydrate', () => {
    // React uses the server snapshot for the hydrating render too, so a live
    // value here renders one number on the server and a later one in the
    // browser — which React reports as a hydration mismatch.
    const html = renderToString(<JobElapsed startedAt={Date.now() - 94_000} />);
    expect(html).toContain('0:00');
    expect(html).not.toContain('1:34');
  });

  it('renders a finished job identically on the server, since it cannot drift', () => {
    const started = Date.now() - 94_000;
    const html = renderToString(<JobElapsed startedAt={started} finishedAt={started + 94_000} />);
    expect(html).toContain('took 1:34');
  });
});

describe('JobElapsed', () => {
  it('renders a running clock as m:ss', () => {
    render(<JobElapsed startedAt={Date.now() - 94_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:34');
  });

  it('renders a finished job as a total', () => {
    const started = Date.now() - 94_000;
    render(<JobElapsed startedAt={started} finishedAt={started + 94_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('took 1:34');
  });

  it('names itself without the ticking number being announced', () => {
    // role="timer" carries an implicit aria-live="off", so a screen reader is
    // not read a new number every second over the message beside it.
    render(<JobElapsed startedAt={Date.now() - 94_000} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Running for 1:34');
  });

  it('keeps counting in minutes past an hour rather than hiding the problem', () => {
    // 73:20, not 1:13:20. A video job at that number is visibly wrong.
    render(<JobElapsed startedAt={Date.now() - 4_400_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('73:20');
  });

  it('renders nothing without a start timestamp', () => {
    render(<JobElapsed startedAt={undefined} />);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('renders nothing for a finished job that reports no duration', () => {
    // `took 0:00` reads as a bug; absence reads as "not measured".
    const started = Date.now();
    render(<JobElapsed startedAt={started} finishedAt={started} />);
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
