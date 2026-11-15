/**
 * Coordinate asynchronous editor writes with backup, deletion and export.
 * Multiple scene editors can have outstanding writes during navigation.
 */
type Flusher=()=>Promise<void>;
const flushers=new Map<string,Set<Flusher>>();
const writes=new Map<string,Set<Promise<unknown>>>();
const failed=new Set<string>();

export function registerEditorFlusher(projectId:string,fn:Flusher):()=>void{
 const group=flushers.get(projectId)||new Set<Flusher>();
 group.add(fn);flushers.set(projectId,group);
 return ()=>{
  const active=flushers.get(projectId);
  active?.delete(fn);
  if(active?.size===0)flushers.delete(projectId);
 };
}

export function trackEditorWrite(projectId:string,write:Promise<unknown>){
 let group=writes.get(projectId);
 if(!group){group=new Set();writes.set(projectId,group);}
 group.add(write);
 const cleanup=()=>{
  const active=writes.get(projectId);
  active?.delete(write);
  if(active?.size===0)writes.delete(projectId);
 };
 void write.then(()=>{failed.delete(projectId);cleanup();},()=>{failed.add(projectId);cleanup();});
}

export async function flushProjectEdits(projectId:string){
 const activeFlushers=[...(flushers.get(projectId)||[])];
 if(activeFlushers.length)await Promise.all(activeFlushers.map(flush=>flush()));
 const active=[...(writes.get(projectId)||[])];
 if(active.length)await Promise.all(active);
 if(failed.has(projectId))throw Error('원고의 미저장 변경 사항이 있어 백업 또는 출력을 진행할 수 없습니다.');
}
