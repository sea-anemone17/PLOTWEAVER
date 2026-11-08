/**
 * Coordinate asynchronous editor writes with backup, deletion and export.
 * A pending debounced edit must be persisted before a snapshot is created.
 */
type Flusher=()=>Promise<void>;
const flushers=new Map<string,Flusher>();
const writes=new Map<string,Promise<unknown>>();

export function registerEditorFlusher(projectId:string,fn:Flusher):()=>void{
 flushers.set(projectId,fn);
 return ()=>{if(flushers.get(projectId)===fn)flushers.delete(projectId);};
}

export function trackEditorWrite(projectId:string,write:Promise<unknown>){
 writes.set(projectId,write);
 const clear=()=>{if(writes.get(projectId)===write)writes.delete(projectId);};
 void write.then(clear,clear);
}

export async function flushProjectEdits(projectId:string){
 const flush=flushers.get(projectId);
 if(flush)await flush();
 const write=writes.get(projectId);
 if(write)await write;
}
