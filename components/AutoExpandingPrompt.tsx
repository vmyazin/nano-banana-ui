'use client';

import { useEffect, useRef, type ChangeEvent, type TextareaHTMLAttributes } from 'react';

type AutoExpandingPromptProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'rows'
>;

const resizeToContent = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight > 0 ? `${textarea.scrollHeight}px` : '';
};

/**
 * The shared generation prompt: two lines at rest, content-sized while typing,
 * then internally scrollable after the same twelve-line cap used by fal.ai.
 */
export default function AutoExpandingPrompt({
  className = '',
  onChange,
  value,
  ...props
}: AutoExpandingPromptProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) resizeToContent(textareaRef.current);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    resizeToContent(event.currentTarget);
    onChange?.(event);
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={2}
      value={value}
      onChange={handleChange}
      className={`max-h-[16.25rem] w-full resize-none overflow-y-auto ${className}`.trim()}
    />
  );
}
