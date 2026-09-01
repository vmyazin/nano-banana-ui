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
}

function isTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement;
}

export default function PromptPanel({ children, className = '' }: PromptPanelProps) {
  const [runnerVisible, setRunnerVisible] = useState(true);
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
      {runnerVisible && (
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
