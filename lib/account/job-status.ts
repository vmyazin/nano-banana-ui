import type { CloudJobState, CloudJobView } from './contracts';
/** One source for how a job state is named and coloured. The account list and the
 *  queue overlay show the same jobs at the same moment, so a second copy of these
 *  maps would let the two surfaces call one state different things. */
export const JOB_STATE_LABELS: Record<CloudJobState,string> = {queued:'Queued',submitting:'Starting',running:'Generating',saving:'Saving',saved:'Saved',needs_attention:'Needs attention',failed:'Failed',cancelled:'Cancelled'};
export const JOB_STATE_TONES: Record<CloudJobState,string> = {queued:'text-sky-300',submitting:'text-sky-300',running:'text-violet-300',saving:'text-cyan-300',saved:'text-emerald-300',needs_attention:'text-amber-300',failed:'text-red-300',cancelled:'text-[var(--foreground-muted)]'};
/** In flight: the provider or our Worker still owes an answer, so the row is
 *  telling the truth when it says something is happening. */
const ACTIVE: CloudJobState[] = ['queued','submitting','running','saving'];
export function isActiveJob(job: Pick<CloudJobView,'state'>) { return ACTIVE.includes(job.state); }
/** Needs a person: it will not resolve itself, so the overlay keeps showing it
 *  until dismissed rather than letting it scroll away with the finished work. */
export function needsAttention(job: Pick<CloudJobView,'state'>) { return job.state === 'needs_attention' || job.state === 'failed'; }
