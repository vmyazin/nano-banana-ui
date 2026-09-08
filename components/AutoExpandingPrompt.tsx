'use client';

import {
  useEffect,
  useRef,
  type ChangeEvent,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';

type AutoExpandingPromptProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'rows'
> & {
  /**
   * The field itself, for a workspace that needs to put the cursor in it — a
   * failed validation should land the reader where the fix is. Named rather
   * than taken as `ref` because this component already keeps one of its own
   * for resizing, and both have to point at the same node.
   */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
};

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
  fieldRef,
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
      ref={(node) => {
        textareaRef.current = node;
        if (fieldRef) fieldRef.current = node;
      }}
      rows={2}
      value={value}
      onChange={handleChange}
      className={`max-h-[16.25rem] w-full resize-none overflow-y-auto ${className}`.trim()}
    />
  );
}
