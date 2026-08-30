import type { ReactNode } from 'react';

interface GenerationWorkspaceLayoutProps {
  /** Model, source media, controls, and the submit action. */
  setup: ReactNode;
  /** Kept in the output rail so prompt edits stay visually tied to their result. */
  prompt: ReactNode;
  /** A provider may render one result or a persistent job list here. */
  results: ReactNode;
}

/**
 * One composition rule for generation workspaces: configure on the left, then
 * iterate on Prompt -> Result/Jobs on the right. On narrow screens the same
 * named slots become a predictable setup -> prompt -> results stack.
 */
export default function GenerationWorkspaceLayout({
  setup,
  prompt,
  results,
}: GenerationWorkspaceLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
      <div className="space-y-3.5">{setup}</div>
      <div className="space-y-3.5">
        {prompt}
        {results}
      </div>
    </div>
  );
}
