import type { Env } from './security';
import { finishJob, getJob, setJobState, type JobRow } from './jobs';
import { captureResult, type ProviderResult } from './assets';
import { adapterFor, type GenerationAdapter, type ProviderHandle } from './providers';

export interface DurableStep {
  do<T>(name:string,config:{retries:{limit:number;delay:string;backoff?:'exponential'|'constant'};timeout?:string},fn:()=>Promise<T>):Promise<T>;
  sleep(name:string,duration:string):Promise<void>;
}
const SAFE={retries:{limit:5,delay:'5 seconds',backoff:'exponential' as const},timeout:'5 minutes'};
const SINGLE={retries:{limit:0,delay:'1 second'},timeout:'5 minutes'};
export async function runGeneration(env:Env,jobId:string,step:DurableStep,override?:GenerationAdapter) {
  let job=await getJob(env,jobId);
  if(!job||['saved','failed','cancelled'].includes(job.state))return;
  try{
    const adapter=override||adapterFor(env,job.provider);
    await step.do('submit',SINGLE,async()=>{
      const current=await getJob(env,jobId);
      if(!current||current.provider_task||current.result_json)return;
      // A synchronous response may have reached R2 before D1 was committed.
      // Recover that object even though repeating the paid call is forbidden.
      if(current.state!=='queued' && adapter.recover){
        const recovered=await adapter.recover(env,current);
        if(recovered){
          await env.DB.prepare("UPDATE account_jobs SET result_json=?,state='saving',updated_at=? WHERE id=? AND deleted=0").bind(JSON.stringify(recovered),Date.now(),jobId).run();
          return;
        }
      }
      // On replay after a process loss, submitting is ambiguous. Never charge again.
      if(current.state!=='queued')throw new Error('submission_ambiguous');
      const claimed=await env.DB.prepare("UPDATE account_jobs SET state = 'submitting', updated_at = ? WHERE id = ? AND state = 'queued' AND deleted = 0").bind(Date.now(),jobId).run();
      if(!claimed.meta.changes)throw new Error('submission_ambiguous');
      const result=await adapter.submit(env,current);
      if(!result.handle&&!result.result)throw new Error('submission_ambiguous');
      await env.DB.prepare("UPDATE account_jobs SET provider_task = ?, result_json = ?, state = ?, updated_at = ? WHERE id = ? AND deleted = 0")
        .bind(result.handle?JSON.stringify(result.handle):null,result.result?JSON.stringify(result.result):null,result.result?'saving':'running',Date.now(),jobId).run();
    });
    for(let attempt=0;attempt<120;attempt++){
      job=await getJob(env,jobId);
      if(!job||job.state==='cancelled')return;
      if(job.result_json)break;
      if(!job.provider_task)throw new Error('submission_ambiguous');
      const outcome=await step.do(`poll-${attempt}`,SAFE,async()=>{
        const current=await getJob(env,jobId);if(!current)return 'deleted';
        const status=await adapter.poll(env,current,JSON.parse(current.provider_task!) as ProviderHandle);
        if(status.state==='failed'){await finishJob(env,jobId,'failed','provider_failed');return 'failed';}
        if(status.state==='success'){
          if(!status.result)throw new Error('Missing result');
          await env.DB.prepare("UPDATE account_jobs SET result_json = ?, state = 'saving', updated_at = ? WHERE id = ? AND deleted = 0").bind(JSON.stringify(status.result),Date.now(),jobId).run();
          return 'success';
        }
        return 'running';
      });
      if(outcome==='failed'||outcome==='deleted')return;
      if(outcome==='success')break;
      await step.sleep(`wait-${attempt}`,'15 seconds');
    }
    job=await getJob(env,jobId);
    if(!job)return;
    if(!job.result_json)throw new Error('provider_timeout');
    const capturedJob:JobRow=job;
    await step.do('save-assets',SAFE,async()=>{
      if(!await getJob(env,jobId))return;
      await captureResult(env,capturedJob,JSON.parse(capturedJob.result_json!) as ProviderResult);
      await finishJob(env,jobId,'saved');
    });
  }catch{
    const current=await getJob(env,jobId);
    if(current&&!['saved','failed','cancelled'].includes(current.state))await setJobState(env,jobId,'needs_attention',current.result_json?'save_failed':current.provider_task?'tracking_interrupted':'submission_ambiguous');
  }
}
