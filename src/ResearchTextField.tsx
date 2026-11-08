import {useEffect,useRef,useState} from 'react';
import {registerEditorFlusher,trackEditorWrite} from './saveBarrier';

type Props={id:string;value:string;label:string;rows?:number;placeholder?:string;onSave:(value:string)=>Promise<unknown>};
export default function ResearchTextField({id,value,label,rows,placeholder,onSave}:Props){
 const [draft,setDraft]=useState(value);
 const pending=useRef<string|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const saveRef=useRef(onSave);saveRef.current=onSave;
 const [status,setStatus]=useState('');
 function flush():Promise<void>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const snapshot=pending.current;
  if(snapshot===null)return queue.current.then(()=>undefined);
  pending.current=null;
  queue.current=queue.current.catch(()=>undefined).then(()=>saveRef.current(snapshot)).then(()=>setStatus('저장됨')).catch(error=>{
   if(pending.current===null)pending.current=snapshot;
   setStatus('저장 실패');
   throw error;
  });
  trackEditorWrite('__global__',queue.current);
  return queue.current.then(()=>undefined);
 }
 useEffect(()=>registerEditorFlusher('__global__',flush),[id]);
 useEffect(()=>()=>{void flush().catch(()=>undefined);},[id]);
 const change=(next:string)=>{
  setDraft(next);pending.current=next;setStatus('저장 대기');
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{void flush().catch(()=>undefined);},450);
 };
 return <label className="research-control">{label}
  {rows?<textarea rows={rows} placeholder={placeholder} value={draft} onChange={e=>change(e.target.value)} onBlur={()=>{void flush().catch(()=>undefined);}}/>:
   <input placeholder={placeholder} value={draft} onChange={e=>change(e.target.value)} onBlur={()=>{void flush().catch(()=>undefined);}}/>}
  {status&&<small aria-live="polite">{status}</small>}
 </label>;
}
