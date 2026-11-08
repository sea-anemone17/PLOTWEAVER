import {useEffect,useState,type ReactNode} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {AlertTriangle,BookOpenText,FolderOpen,RefreshCw,ShieldCheck} from 'lucide-react';
import {db} from './data';
import {acquireProjectLease,clearOwnedLease,LEASE_REFRESH_MS,ownedLeaseToken,releaseProjectLease,renewProjectLease,setOwnedLease} from './projectLease';
import {flushProjectEdits} from './saveBarrier';
import {Button} from './UI';

type Props={projectId:string;projectTitle:string;onGoHome:()=>void;children:ReactNode};
type State='checking'|'editing'|'locked'|'error';

function plainText(node:{text?:string;content?:unknown[]}):string{
 return (node.text||'')+(node.content||[]).map(item=>
  item&&typeof item==='object'?plainText(item as {text?:string;content?:unknown[]}):'').join('');
}
function ReadonlyProject({projectId,reason}:{projectId:string;reason:string}){
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).filter(s=>!s.deletedAt).toArray(),[projectId],[]);
 const legacy=useLiveQuery(()=>db.manuscripts.get(projectId),[projectId]);
 const docs=useLiveQuery(()=>db.sceneDocs.where('projectId').equals(projectId).toArray(),[projectId],[]);
 return <section className="lease-readonly" aria-label="읽기 전용 원고">
  <h3><BookOpenText size={17}/> 읽기 전용 원고 미리보기</h3>
  <p className="muted small">{reason} · 이 화면에서는 문서를 수정하거나 삭제할 수 없습니다.</p>
  <details><summary>기존 연속 원고</summary><p>{plainText(legacy?.content||{}).slice(0,1800)||'원고 없음'}</p></details>
  {scenes.sort((a,b)=>a.order-b.order).map(scene=>{
   const document=docs.find(x=>x.sceneId===scene.id);
   return <details key={scene.id}><summary>{scene.title}</summary>
    <p>{plainText(document?.content||{}).slice(0,1800)||'장면별 원고 없음'}</p>
   </details>;
  })}
 </section>;
}
export default function ProjectEditGate({projectId,projectTitle,onGoHome,children}:Props){
 const [attempt,setAttempt]=useState(0);
 const [state,setState]=useState<State>('checking');
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let cancelled=false;
  let interval:ReturnType<typeof setInterval>|null=null;
  const token=crypto.randomUUID();
  setState('checking');setMessage('');
  const lose=(reason:string)=>{
   if(cancelled)return;
   clearOwnedLease(projectId,token);
   if(interval){clearInterval(interval);interval=null;}
   setMessage(reason);
   setState('locked');
  };
  const start=async()=>{
   try{
    const acquired=await acquireProjectLease(projectId,token);
    if(cancelled){
     if(acquired)await releaseProjectLease(projectId,token);
     return;
    }
    if(!acquired){setState('locked');setMessage('다른 브라우저 탭이 이 프로젝트를 편집 중입니다.');return;}
    setOwnedLease(projectId,token);
    setState('editing');
    const tick=async()=>{
     try{if(!await renewProjectLease(projectId,token))lose('편집권이 다른 탭으로 이동했습니다. 미저장 변경이 있다면 이전 탭에서 확인해 주세요.');}
     catch{lose('편집권 상태를 확인할 수 없습니다. 원고를 보호하기 위해 편집을 중지했습니다.');}
    };
    interval=setInterval(()=>void tick(),LEASE_REFRESH_MS);
    const onVisible=()=>{if(document.visibilityState==='visible')void tick();};
    document.addEventListener('visibilitychange',onVisible);
    cleanupVisible=()=>document.removeEventListener('visibilitychange',onVisible);
   }catch(error){
    if(cancelled)return;
    setState('error');setMessage('편집권 확인 실패: '+String(error));
   }
  };
  let cleanupVisible:()=>void=()=>{};
  void start();
  return ()=>{
   cancelled=true;
   cleanupVisible();
   if(interval)clearInterval(interval);
   if(ownedLeaseToken(projectId)===token){
    // Finish any pending debounced writes while the lease is still valid.
    void flushProjectEdits(projectId).catch(()=>undefined).finally(()=>{
     clearOwnedLease(projectId,token);
     void releaseProjectLease(projectId,token).catch(()=>undefined);
    });
   }
  };
 },[projectId,attempt]);
 if(state!=='editing')return <main className="lease-screen">
  <div className="lease-card">
   <ShieldCheck size={34}/>
   <div className="eyebrow">PLOTWEAVER · LOCAL EDIT LOCK</div>
   <h1>{projectTitle}</h1>
   <h2>{state==='checking'?'편집권 확인 중':state==='error'?'편집 상태 확인 실패':'다른 탭에서 편집 중입니다'}</h2>
   <p>{message||'같은 프로젝트를 두 탭에서 동시에 수정하면 원고가 덮어써질 수 있어 편집권을 확인합니다.'}</p>
   <div className="research-actions">
    <Button variant="soft" onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={16}/> 편집권 다시 확인</Button>
    <Button variant="ghost" onClick={onGoHome}><FolderOpen size={16}/> 프로젝트 목록</Button>
   </div>
   {state!=='checking'&&<><p className="lease-warning"><AlertTriangle size={16}/> 다른 탭이 종료되었거나 응답하지 않으면 편집권이 만료된 뒤 다시 확인할 수 있습니다. 강제로 데이터를 덮어쓰지는 않습니다.</p>
    <ReadonlyProject projectId={projectId} reason={message||'다른 탭이 편집 중입니다'}/></>}
  </div>
 </main>;
 return <>{children}</>;
}
