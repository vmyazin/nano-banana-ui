'use client';
import { Cloud, Monitor } from 'lucide-react';
import type { useCloudWorkspace } from '@/lib/account/useCloudWorkspace';
export default function CloudExecutionNotice({workspace}:{workspace:ReturnType<typeof useCloudWorkspace>}) {
  if(!workspace.signedIn&&!workspace.uncertain)return null;
  return <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-3 text-sm">
    <p className="flex items-center gap-2 font-medium text-cyan-200">{workspace.cloud?<Cloud size={16} aria-hidden="true"/>:<Monitor size={16} aria-hidden="true"/>}{workspace.uncertain&&workspace.cloud?'Account status unavailable':workspace.cloud?'Background generation · autosave':'Browser-only generation'}</p>
    <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">{workspace.uncertain&&workspace.cloud?'We could not confirm your account. Wait for the connection to recover, or explicitly use browser-only generation.':workspace.cloud?(workspace.enabled?'Accepted jobs keep running after you leave. Results save to your account.':'Background generation for this provider is not enabled yet.'):'Keep this tab open and download your results. This job will not use your saved account connection or cloud library.'}</p>
    <button type="button" onClick={workspace.cloud?workspace.useBrowser:workspace.useCloud} className="mt-2 text-xs text-[var(--foreground)] underline underline-offset-4">{workspace.cloud?'Use browser-only generation instead':'Use background generation'}</button>
  </div>;
}
