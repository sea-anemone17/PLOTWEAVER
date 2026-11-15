import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {BookmarkPlus,History,RotateCcw,Trash2} from 'lucide-react';
import {db} from './data';
import {createNamedCheckpoint,deleteRecoveryRecord,restoreRecoveryRecord} from './recovery';
import {Button,Empty,Header} from './UI';

type Props={projectId:string;onOpenManuscript:(sceneId?:string)=>void};
function toText(node:{type?:string;text?:string;content?:unknown[]}):string{
 const inside=(node.content||[]).map(c=>c&&typeof c==='object'?toText(c as {type?:string;text?:string;content?:unknown[]}):'').join('');
 const end=node.type==='paragraph'||node.type==='heading'?'\n':'';
 return (node.text||'')+inside+end;
}
export default function RecoveryHistory({projectId,onOpenManuscript}:Props){
 const records=useLiveQuery(()=>db.recoveryRecords.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const [docKey,setDocKey]=useState('legacy');
 const [name,setName]=useState('');
 const [selectedId,setSelectedId]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const list=records.filter(r=>r.docKey===docKey).sort((a,b)=>b.createdAt-a.createdAt);
 const selected=list.find(r=>r.id===selectedId)||list[0];
 const currentScene=docKey==='legacy'?undefined:scenes.find(x=>x.id===docKey);
 const docName=(id:string)=>id==='legacy'?'기존 연속 원고':scenes.find(s=>s.id===id)?.title||'삭제되거나 누락된 장면';
 async function run(fn:()=>Promise<unknown>){
  setBusy(true);setError('');
  try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}
 }
 return <section className="recovery-workspace">
  <Header eyebrow="RECOVERY HISTORY" title="원고 복구 기록" description="자동 기록과 이름 붙인 복구 지점을 별도로 보존합니다. 복원하기 전 현재 원고도 안전 기록으로 남깁니다."/>
  {error&&<p role="alert" className="graph-error">{error}</p>}
  <div className="recovery-top">
   <label>대상 원고
    <select value={docKey} onChange={e=>{setDocKey(e.target.value);setSelectedId('');}}>
     <option value="legacy">기존 연속 원고</option>
     {scenes.map(s=><option key={s.id} value={s.id}>{s.deletedAt?'[휴지통] ':''}{s.title}</option>)}
    </select>
   </label>
   <div className="recovery-create">
    <input aria-label="복구 지점 이름" placeholder="복구 지점 이름 (예: 결말 수정 전)" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/>
    <Button disabled={busy||!name.trim()||!!currentScene?.deletedAt} onClick={()=>void run(async()=>{
     await createNamedCheckpoint(projectId,docKey==='legacy'?undefined:docKey,name);
     setName('');
    })}><BookmarkPlus size={15}/> 현재 원고 보존</Button>
   </div>
  </div>
  {currentScene?.deletedAt&&<p className="recovery-warning">휴지통의 장면은 복구 기록을 열람할 수 있지만 원고를 되돌리려면 먼저 프로젝트 설정에서 장면을 복원해야 합니다.</p>}
  {!list.length?<Empty title="이 원고의 복구 기록이 없습니다" description="이름 붙인 복구 지점을 직접 만들 수 있습니다. 자동 기록은 원고 저장 중 일정 간격으로 생성됩니다."/>:
  <div className="recovery-layout">
   <aside className="recovery-list">
    {list.map(r=><button type="button" key={r.id} className={selected?.id===r.id?'selected':''} onClick={()=>setSelectedId(r.id)}>
     <small>{r.kind==='auto'?'자동 기록':r.kind==='named'?'사용자 보존':r.kind==='emergency'?'미저장 초안 긴급 보존':'복원 직전 안전 기록'}</small>
     <strong>{r.label}</strong>
     <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
    </button>)}
   </aside>
   {selected&&<article className="recovery-detail">
    <h3><History size={19}/> {selected.label}</h3>
    <p className="muted small">원고: {docName(selected.docKey)} · {new Date(selected.createdAt).toLocaleString('ko-KR')}</p>
    <pre className="recovery-preview">{toText(selected.content).slice(0,10000)||'(빈 원고)'}</pre>
    <p className="muted small">내용 미리보기는 최대 10,000자입니다. 실제 복원은 원고 문서 구조 전체를 사용합니다.</p>
    <div className="research-actions">
     <Button disabled={busy||!!currentScene?.deletedAt} onClick={()=>void run(async()=>{
      if(!confirm('선택한 기록으로 현재 원고를 복원하시겠습니까? 복원 직전 상태를 별도 안전 기록으로 보관합니다.'))return;
      await restoreRecoveryRecord(projectId,selected.id);
      onOpenManuscript(selected.docKey==='legacy'?undefined:selected.docKey);
     })}><RotateCcw size={15}/> 이 기록으로 원고 복원</Button>
     <Button variant="soft" onClick={()=>onOpenManuscript(selected.docKey==='legacy'?undefined:selected.docKey)}>현재 원고 열기</Button>
     <Button variant="danger" disabled={busy} onClick={()=>void run(async()=>{
      if(confirm('이 복구 기록만 삭제하시겠습니까? 현재 원고는 변경되지 않습니다.'))await deleteRecoveryRecord(projectId,selected.id);
     })}><Trash2 size={15}/> 기록 삭제</Button>
    </div>
   </article>}
  </div>}
 </section>;
}
