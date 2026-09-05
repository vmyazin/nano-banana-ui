import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from './security';
import { runGeneration, type DurableStep } from './generation-runner';
export class GenerationWorkflow extends WorkflowEntrypoint<Env,{jobId:string}> {
  async run(event:WorkflowEvent<{jobId:string}>,step:WorkflowStep) {
    await runGeneration(this.env,event.payload.jobId,step as unknown as DurableStep);
  }
}
