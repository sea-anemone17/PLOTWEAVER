import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {Link2,BookMarked} from 'lucide-react';
import {db,now,type ThemeRelation} from './data';
import {addThemeRelation,switchPinnedRevision} from './researchData';
import {Button,Empty,Header} from './UI';
import ResearchTextField from './ResearchTextField';
import {guardedProjectWrite} from './projectLease';

type Props={projectId:string;onOpenGlobalThemes:()=>void};
const TARGET_TYPES:{value:ThemeRelation['targetKind'];label:string}[]=[
 {value:'scene',label:'장면'},{value:'npc',label:'NPC'},{value:'clue',label:'단서'},{value:'plotEdge',label:'진행 관계'}
];
export default function ProjectThemes({projectId,onOpenGlobalThemes}:Props){
 const refs=useLiveQuery(()=>db.projectThemes.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const revisions=useLiveQuery(()=>db.themeRevisions.toArray(),[],[]);
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).filter(x=>!x.deletedAt).toArray(),[projectId],[]);
 const lore=useLiveQuery(()=>db.lore.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const clues=useLiveQuery(()=>db.clues.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const edges=useLiveQuery(()=>db.plotEdges.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const relations=useLiveQuery(()=>db.themeRelations.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const [selectedId,setSelectedId]=useState('');
 const [targetKind,setTargetKind]=useState<ThemeRelation['targetKind']>('scene');
 const [targetId,setTargetId]=useState('');
 const [error,setError]=useState('');
 const selected=refs.find(x=>x.id===selectedId)||refs[0];
 const own=relations.filter(r=>r.projectThemeId===selected?.id);
 const options=targetKind==='scene'?scenes.map(s=>({id:s.id,title:s.title})):
  targetKind==='npc'?lore.filter(x=>x.kind==='NPC').map(x=>({id:x.id,title:x.title})):
  targetKind==='clue'?clues.map(x=>({id:x.id,title:x.title})):
  edges.map(x=>({id:x.id,title:(scenes.find(s=>s.id===x.fromSceneId)?.title||'장면')+' → '+(scenes.find(s=>s.id===x.toSceneId)?.title||'미정')+(x.label?' · '+x.label:'')}));
 const labelFor=(r:ThemeRelation)=>{
  if(r.targetKind==='scene')return scenes.find(x=>x.id===r.targetId)?.title||'삭제된 장면';
  if(r.targetKind==='npc')return lore.find(x=>x.id===r.targetId)?.title||'삭제된 NPC';
  if(r.targetKind==='clue')return clues.find(x=>x.id===r.targetId)?.title||'삭제된 단서';
  return edges.find(x=>x.id===r.targetId)?.label||'진행 관계';
 };
 const attempt=(p:Promise<unknown>)=>{void p.then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e)));};
 async function addLink(){
  if(!selected||!targetId)return;
  await addThemeRelation(selected.id,targetKind,targetId);
  setTargetId('');
 }
 return <div className="project-themes">
  <Header eyebrow="PROJECT THEME" title="프로젝트 주제의식" description="전역 주제의식의 특정 개정본을 고정하고, 이 시나리오에서의 의미와 장면별 적용을 독립적으로 기록합니다."/>
  <div className="research-actions"><Button variant="soft" onClick={onOpenGlobalThemes}><BookMarked size={15}/> 전역 주제의식 보관함 열기</Button></div>
  {error&&<p className="graph-error" role="alert">{error}</p>}
  {!refs.length?<Empty title="아직 적용한 주제의식이 없습니다" description="전역 주제의식 보관함에서 이름 붙인 개정본을 만든 뒤 이 프로젝트에 고정해 주세요." action={onOpenGlobalThemes}/>:
  <div className="research-master-detail">
   <aside className="research-list"><div className="research-list-items">{refs.map(ref=><button type="button" key={ref.id} className={selected?.id===ref.id?'selected':''} onClick={()=>{setSelectedId(ref.id);setTargetId('');}}>
    <small>고정된 개정본</small><strong>{ref.pinned.title}</strong><span>{ref.pinned.claim}</span>
   </button>)}</div></aside>
   {selected&&<article className="project-theme-detail">
    <div className="eyebrow">PINNED SNAPSHOT</div><h2>{selected.pinned.title}</h2>
    <blockquote>{selected.pinned.claim||'핵심 명제 미작성'}</blockquote>
    <h3>고정된 논증 카드</h3>
    {selected.pinned.cards.length?selected.pinned.cards.map(card=><p className="project-pinned-card" key={card.id}><small>{card.kind}</small>{card.text||'내용 미작성'}</p>):<p className="muted small">개정 당시 논증 카드가 없습니다.</p>}
    <ResearchTextField key={selected.id+'notes'} id={selected.id+'notes'} saveScope={projectId} rows={6}
     label="이 프로젝트에서의 해석·활용 메모" value={selected.notes}
     placeholder="작품의 갈등·선택·결말을 통해 이 명제를 어떻게 다룰까요?"
     onSave={notes=>guardedProjectWrite(projectId,[db.projectThemes],async()=>{await db.projectThemes.update(selected.id,{notes,updatedAt:now()});})}/>
    <div className="research-fields"><label>고정 개정본 전환
     <select aria-label="고정된 개정본 바꾸기" value={selected.revisionId} onChange={e=>{
      const id=e.target.value;
      if(confirm('고정할 개정본을 변경하시겠습니까? 기존 프로젝트 메모와 장면 관계는 유지됩니다.'))attempt(switchPinnedRevision(selected.id,id));
     }}>
      {!revisions.some(r=>r.id===selected.revisionId)&&<option value={selected.revisionId}>보존된 사본 (원본 개정본 없음)</option>}
      {revisions.filter(r=>r.themeId===selected.themeId).map(r=><option value={r.id} key={r.id}>{r.label}</option>)}
     </select></label>
    </div>
    <section className="project-theme-links"><h3><Link2 size={15}/> 서사 요소 연결</h3>
     <div className="research-actions">
      <select aria-label="관계 대상 유형" value={targetKind} onChange={e=>{setTargetKind(e.target.value as ThemeRelation['targetKind']);setTargetId('');}}>
       {TARGET_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select aria-label="연결할 대상" value={targetId} onChange={e=>setTargetId(e.target.value)}>
       <option value="">연결할 요소 선택</option>{options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
      <Button variant="soft" disabled={!targetId} onClick={()=>attempt(addLink())}>연결</Button>
     </div>
     {own.map(link=><div className="garden-link-row" key={link.id}><span>{TARGET_TYPES.find(t=>t.value===link.targetKind)?.label} · {labelFor(link)}</span>
      <button title="관계만 제거" onClick={()=>attempt(guardedProjectWrite(projectId,[db.themeRelations],async()=>{await db.themeRelations.delete(link.id);}))}>연결 해제</button>
     </div>)}
     {!own.length&&<p className="muted small">연결된 장면이나 자료가 없습니다. 필요할 때만 추가하세요.</p>}
    </section>
   </article>}
  </div>}
 </div>;
}
