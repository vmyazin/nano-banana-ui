'use client';

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

const REPEAT_DELAY_MS = 5_000;

interface PromptPanelProps {
  children: ReactNode;
  className?: string;
  /**
   * Suppress the ambient perimeter runner entirely. A workspace that cannot
   * submit — no provider key yet — dims and disables this panel, and a lap of
   * cyan running around a disabled control invites an edit that goes nowhere.
   */
  paused?: boolean;
}

function isTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement;
}

export default function PromptPanel({ children, className = '', paused = false }: PromptPanelProps) {
  const [runnerVisible, setRunnerVisible] = useState(!paused);
  const textareaFocusedRef = useRef(false);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRepeatTimer = () => {
    if (repeatTimerRef.current === null) return;
    clearTimeout(repeatTimerRef.current);
    repeatTimerRef.current = null;
  };

  const scheduleRepeat = () => {
    clearRepeatTimer();
    repeatTimerRef.current = setTimeout(() => {
      repeatTimerRef.current = null;
      if (!textareaFocusedRef.current) setRunnerVisible(true);
    }, REPEAT_DELAY_MS);
  };

  useEffect(() => () => {
    if (repeatTimerRef.current !== null) clearTimeout(repeatTimerRef.current);
  }, []);


  // Adjusted during render rather than in an effect: pausing stops the current
  // lap and any pending repeat, and un-pausing hands the panel one fresh lap, so
  // connecting a key visibly returns the panel to life.
  const [wasPaused, setWasPaused] = useState(paused);
  if (wasPaused !== paused) {
    setWasPaused(paused);
    // A repeat timer already in flight needs no cancelling: the runner cannot
    // render while paused, and un-pausing sets it visible anyway.
    setRunnerVisible(!paused);
  }

  const handleAnimationEnd = () => {
    setRunnerVisible(false);
    if (!textareaFocusedRef.current && repeatTimerRef.current === null) {
      scheduleRepeat();
    }
  };

  const handleFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (!isTextarea(event.target)) return;
    textareaFocusedRef.current = true;
    clearRepeatTimer();
  };

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (!isTextarea(event.target)) return;
    textareaFocusedRef.current = false;
    scheduleRepeat();
  };

  return (
    <section
      data-testid="prompt-panel"
      className={`prompt-panel relative p-3.5 md:p-4 ${className}`.trim()}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {runnerVisible && !paused && (
        <svg
          aria-hidden="true"
          focusable="false"
          className="prompt-panel-border-runner"
        >
          <rect
            data-testid="prompt-panel-runner"
            className="prompt-panel-border-runner-track"
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="11"
            pathLength="100"
            vectorEffect="non-scaling-stroke"
            onAnimationEnd={handleAnimationEnd}
          />
        </svg>
      )}
      <div className="relative z-[1] space-y-3">{children}</div>
    </section>
  );
}
