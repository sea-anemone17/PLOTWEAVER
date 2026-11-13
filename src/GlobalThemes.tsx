import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {BookmarkPlus,BookMarked,Plus,Trash2,Undo2} from 'lucide-react';
import {db,now,type ThemeCardKind,type ThemeCard} from './data';
import {addThemeCard,createTheme,pinThemeRevision,saveThemeRevision} from './researchData';
import {Button,Empty,Header} from './UI';
import ResearchTextField from './ResearchTextField';
import GlobalRichEditor from './GlobalRichEditor';
import {diffThemeSnapshot,plainText,restoreThemeRevisionSafely} from './themeRevisionTools';

const KINDS:{id:ThemeCardKind;label:string;help:string}[]=[
 {id:'claim',label:'핵심 명제',help:'중심 주장에 딸린 보조 명제'},
 {id:'reason',label:'근거',help:'그렇게 판단하는 이유'},
 {id:'objection',label:'반론',help:'이 주장에 대한 이의'},
 {id:'reconsideration',label:'재검토',help:'반론 이후 새롭게 발견한 관점'}
];
export default function GlobalThemes(){
 const all=useLiveQuery(()=>db.themes.orderBy('updatedAt').reverse().toArray(),[],[]);
 const cards=useLiveQuery(()=>db.themeCards.toArray(),[],[]);
 const revisions=useLiveQuery(()=>db.themeRevisions.toArray(),[],[]);
 const projects=useLiveQuery(()=>db.projects.toArray(),[],[]);
 const pins=useLiveQuery(()=>db.projectThemes.toArray(),[],[]);
 const [selectedId,setSelectedId]=useState('');
 const [search,setSearch]=useState('');
 const [cardKind,setCardKind]=useState<ThemeCardKind>('reason');
 const [revisionName,setRevisionName]=useState('');
 const [pinProject,setPinProject]=useState('');
 const [pinRevision,setPinRevision]=useState('');
 const [error,setError]=useState('');
 const [compareId,setCompareId]=useState('');
 const [linkSource,setLinkSource]=useState('');
 const [linkTarget,setLinkTarget]=useState('');
 const [linkKind,setLinkKind]=useState<'supports'|'refutes'>('supports');
 const visible=all.filter(t=>!t.deletedAt);
 const selected=visible.find(t=>t.id===selectedId)||visible[0]||null;
 const ownCards=cards.filter(c=>c.themeId===selected?.id).sort((a,b)=>a.order-b.order);
 const ownRevisions=revisions.filter(r=>r.themeId===selected?.id).sort((a,b)=>b.createdAt-a.createdAt);
 const doTask=(promise:Promise<unknown>)=>{void promise.then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e)));};
 async function add(){
  const t=await createTheme();setSelectedId(t.id);
 }
 async function saveRevision(){
  if(!selected)return;
  const revision=await saveThemeRevision(selected.id,revisionName);
  setRevisionName('');setPinRevision(revision.id);
 }
 async function restoreRevision(id:string){
  if(!selected||!confirm('선택한 개정본으로 현재 초안을 바꾸시겠습니까? 현재 상태는 복원 직전 개정본으로 자동 보존됩니다.'))return;
  try{const safety=await restoreThemeRevisionSafely(selected.id,id);setCompareId('');alert('복원 완료. 기존 초안은 ‘'+safety.label+'’에 보존되었습니다.');}
  catch(e){setError('개정본 복원 실패: '+String(e));}
 }
 async function pin(){
  if(!pinProject||!pinRevision)return;
  await pinThemeRevision(pinProject,pinRevision);setPinProject('');setPinRevision('');
 }
 async function addArgumentLink(){
  const source=ownCards.find(c=>c.id===linkSource);
  if(!source||!linkTarget||source.id===linkTarget||!ownCards.some(c=>c.id===linkTarget))throw Error('서로 다른 논증 카드를 선택해 주세요.');
  const existing=source.links||[];
  if(existing.some(l=>l.targetId===linkTarget&&l.kind===linkKind))return;
  await db.themeCards.update(source.id,{links:[...existing,{targetId:linkTarget,kind:linkKind}],updatedAt:now()});
  setLinkTarget('');
 }
 async function reorder(card:ThemeCard,direction:-1|1){
  const ordered=ownCards.filter(c=>c.kind===card.kind);
  const index=ordered.findIndex(x=>x.id===card.id);
  const other=ordered[index+direction];if(!other)return;
  await db.transaction('rw',db.themeCards,async()=>{
   await db.themeCards.update(card.id,{order:other.order,updatedAt:now()});
   await db.themeCards.update(other.id,{order:card.order,updatedAt:now()});
  });
 }
 return <div className="research-workspace">
  <Header eyebrow="THEME LABORATORY" title="주제의식 보관함" description="핵심 명제를 논증 카드와 자유 서술로 발전시키고, 의미 있는 개정본을 보존합니다." action={()=>doTask(add())} actionText="+ 주제의식"/>
  {error&&<p className="graph-error" role="alert">{error}</p>}
  {!visible.length?<Empty title="작품이 말하고자 하는 질문에서 시작하세요" description="핵심 명제 한 문장으로 시작해도 충분합니다." action={()=>doTask(add())}/>:
  <div className="research-master-detail">
   <aside className="research-list">
    <input aria-label="주제의식 검색" placeholder="주제의식 검색…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <div className="research-list-items">{visible.filter(t=>[t.title,t.claim].join(' ').toLowerCase().includes(search.toLowerCase())).map(t=><button type="button" className={selected?.id===t.id?'selected':''} key={t.id} onClick={()=>{setSelectedId(t.id);setPinRevision('');}}>
     <small>주제의식</small><strong>{t.title||'이름 없는 주제'}</strong><span>{t.claim.slice(0,70)}</span>
    </button>)}</div>
    {all.some(t=>t.deletedAt)&&<details className="research-trash"><summary>휴지통</summary>{all.filter(t=>t.deletedAt).map(t=><div key={t.id} className="garden-link-row"><span>{t.title}</span><button onClick={()=>doTask(db.themes.update(t.id,{deletedAt:0,updatedAt:now()}))}><Undo2 size={13}/> 복원</button></div>)}</details>}
   </aside>
   {selected&&<div className="theme-editor">
    <div className="theme-heading">
     <ResearchTextField key={selected.id+'title'} id={selected.id+'title'} label="주제 제목" value={selected.title} onSave={title=>db.themes.update(selected.id,{title,updatedAt:now()})}/>
     <ResearchTextField key={selected.id+'claim'} id={selected.id+'claim'} label="핵심 명제" value={selected.claim} rows={3} onSave={claim=>db.themes.update(selected.id,{claim,updatedAt:now()})}/>
    </div>
    <div className="theme-split">
     <section className="theme-cards">
      <div className="section-caption"><h3>논증 카드</h3><span>{ownCards.length}개</span></div>
      <div className="theme-create-card"><select aria-label="새 카드 유형" value={cardKind} onChange={e=>setCardKind(e.target.value as ThemeCardKind)}>{KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select>
       <Button variant="soft" onClick={()=>doTask(addThemeCard(selected.id,cardKind))}><Plus size={14}/> 카드 추가</Button>
      </div>
      {KINDS.map(kind=><section className="theme-card-group" key={kind.id}>
       <h4>{kind.label}</h4><p className="muted small">{kind.help}</p>
       {ownCards.filter(c=>c.kind===kind.id).map(c=><div className="argument-card" key={c.id}>
        <ResearchTextField id={c.id} label={kind.label} value={c.text} rows={3} onSave={text=>db.themeCards.update(c.id,{text,updatedAt:now()})}/>
        <div className="argument-card-actions">
         <select aria-label="논증 카드 유형 변경" value={c.kind} onChange={e=>doTask(db.themeCards.update(c.id,{kind:e.target.value as ThemeCardKind,updatedAt:now()}))}>{KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select>
         <button title="위로" onClick={()=>doTask(reorder(c,-1))}>↑</button><button title="아래로" onClick={()=>doTask(reorder(c,1))}>↓</button>
         <button title="카드 삭제" onClick={()=>{if(confirm('이 논증 카드를 삭제할까요? 명시적으로 보존한 개정본에는 영향을 주지 않습니다.'))doTask(db.themeCards.delete(c.id));}}><Trash2 size={14}/></button>
        </div>
       </div>)}
      </section>)}
     </section>
     <section className="theme-prose">
      <div className="section-caption"><h3>자유 서술</h3><span>논증 카드와 독립</span></div>
      <GlobalRichEditor key={selected.id} documentId={selected.id+'-prose'} content={selected.prose}
       onSave={prose=>db.themes.update(selected.id,{prose,updatedAt:now()})}/>
     </section>
    </div>
    <section className="theme-revisions">
     <h3>논증 관계망</h3>
     <p className="muted small">근거·반박의 연결을 카드 단위로 기록합니다. 개정본에도 관계가 함께 보존됩니다.</p>
     <div className="research-actions">
      <select aria-label="출발 카드" value={linkSource} onChange={e=>setLinkSource(e.target.value)}><option value="">출발 카드</option>{ownCards.map(c=><option key={c.id} value={c.id}>{c.text.slice(0,35)||c.kind}</option>)}</select>
      <select aria-label="관계 종류" value={linkKind} onChange={e=>setLinkKind(e.target.value as 'supports'|'refutes')}><option value="supports">근거·지지</option><option value="refutes">반박</option></select>
      <select aria-label="대상 카드" value={linkTarget} onChange={e=>setLinkTarget(e.target.value)}><option value="">대상 카드</option>{ownCards.filter(c=>c.id!==linkSource).map(c=><option key={c.id} value={c.id}>{c.text.slice(0,35)||c.kind}</option>)}</select>
      <Button variant="soft" disabled={!linkSource||!linkTarget} onClick={()=>doTask(addArgumentLink())}>관계 추가</Button>
     </div>
     {ownCards.flatMap(c=>(c.links||[]).map((link,index)=><div className="garden-link-row" key={c.id+'-'+index}>
      <span>{c.text.slice(0,45)||c.kind} <strong>{link.kind==='supports'?'── 근거 →':'── 반박 →'}</strong> {ownCards.find(t=>t.id===link.targetId)?.text.slice(0,45)||'(삭제된 카드)'}</span>
      <button title="논증 관계만 삭제" onClick={()=>doTask(db.themeCards.update(c.id,{links:(c.links||[]).filter((_,i)=>i!==index),updatedAt:now()}))}>×</button>
     </div>))}
     <hr/>

     <h3><BookMarked size={17}/> 이름 붙인 개정본</h3>
     <p className="muted small">개정본은 생성 후 수정하지 않습니다. 현재 초안이 바뀌어도 기존 개정본과 프로젝트에 고정된 내용은 유지됩니다.</p>
     <div className="research-actions"><input aria-label="개정본 이름" placeholder="예: 반론 수정 전, 최종 논증" value={revisionName} onChange={e=>setRevisionName(e.target.value)}/>
      <Button disabled={!revisionName.trim()} onClick={()=>doTask(saveRevision())}><BookmarkPlus size={15}/> 개정본 보존</Button></div>
     {ownRevisions.map(rev=><details className="revision-entry" key={rev.id}>
      <summary><strong>{rev.label}</strong><small>{new Date(rev.createdAt).toLocaleString('ko-KR')}</small></summary>
      <p><strong>핵심 명제:</strong> {rev.snapshot.claim||'미작성'}</p>
      <p>논증 카드 {rev.snapshot.cards.length}개 · 프로젝트 고정 {pins.filter(p=>p.revisionId===rev.id).length}개</p>
      <div className="research-actions">
       <button onClick={()=>setCompareId(compareId===rev.id?'':rev.id)}>현재 초안과 비교</button>
       <button onClick={()=>void restoreRevision(rev.id)}>현재 초안으로 안전 복원</button>
       <button onClick={()=>setPinRevision(rev.id)}>이 개정본을 프로젝트에 적용</button>
      </div>
      {compareId===rev.id&&<div className="revision-diff">
       {(()=>{
        const snapshot={title:selected.title,claim:selected.claim,prose:selected.prose,cards:ownCards.map(({id,kind,text,order,links})=>({id,kind,text,order,links}))};
        const diff=diffThemeSnapshot(snapshot,rev.snapshot);
        return <>
         <p><strong>제목:</strong> {diff.titleChanged?'변경됨':'동일'} · <strong>핵심 명제:</strong> {diff.claimChanged?'변경됨':'동일'} · <strong>자유 서술:</strong> {diff.proseChanged?'변경됨':'동일'}</p>
         <p>논증 카드 추가 {diff.added.length} · 삭제 {diff.removed.length} · 수정 {diff.modified.length}</p>
         {diff.claimChanged&&<div><strong>보존본 핵심 명제</strong><p>{rev.snapshot.claim||'미작성'}</p><strong>현재 핵심 명제</strong><p>{selected.claim||'미작성'}</p></div>}
         {diff.proseChanged&&<details><summary>자유 서술 텍스트 비교</summary><p><strong>보존본:</strong> {plainText(rev.snapshot.prose).slice(0,3000)}</p><p><strong>현재:</strong> {plainText(selected.prose).slice(0,3000)}</p></details>}
         {[...diff.added,...diff.removed,...diff.modified].map(c=><p key={c.id}><strong>{c.kind}:</strong> {c.text||'(빈 카드)'}</p>)}
        </>;
       })()}
      </div>}
     </details>)}
     {ownRevisions.length===0&&<p className="muted small">아직 보존된 개정본이 없습니다.</p>}
     <div className="theme-pin-area"><h4>프로젝트에 고정하기</h4>
      <div className="research-actions">
       <select value={pinProject} onChange={e=>setPinProject(e.target.value)} aria-label="적용할 프로젝트">
        <option value="">프로젝트 선택</option>
        {projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
       </select>
       <select value={pinRevision} onChange={e=>setPinRevision(e.target.value)} aria-label="고정할 개정본">
        <option value="">개정본 선택</option>
        {ownRevisions.map(rev=><option key={rev.id} value={rev.id}>{rev.label}</option>)}
       </select>
       <Button variant="soft" disabled={!pinProject||!pinRevision} onClick={()=>doTask(pin())}>고정</Button>
      </div>
     </div>
    </section>
    <Button variant="danger" onClick={()=>{if(confirm('이 주제의식을 휴지통으로 옮길까요? 기존 개정본과 프로젝트에 고정된 사본은 유지됩니다.'))doTask(db.themes.update(selected.id,{deletedAt:now(),updatedAt:now()}));}}><Trash2 size={14}/> 주제의식 휴지통</Button>
   </div>}
  </div>}
 </div>;
}
