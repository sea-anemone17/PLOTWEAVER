import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {BookOpen,FilePlus,Link2,Trash2,Undo2} from 'lucide-react';
import {db,now,type KnowledgeKind,type KnowledgeNote} from './data';
import {createKnowledge} from './researchData';
import {Button,Empty,Header} from './UI';
import GlobalRichEditor from './GlobalRichEditor';

export const KNOWLEDGE_KINDS:{value:KnowledgeKind;label:string;headings:string[]}[]=[
 {value:'thinker',label:'사상가',headings:['핵심 사상','주요 저작','서사적 연결']},
 {value:'school',label:'철학·사조',headings:['핵심 개념','중요한 주장','쟁점과 반론']},
 {value:'literature',label:'문학 작품',headings:['작품 개요','주제와 상징','참고 구절']},
 {value:'concept',label:'개념·학습 노트',headings:['개념 설명','사례','추가 질문']}
];
const getLabel=(kind:KnowledgeKind)=>KNOWLEDGE_KINDS.find(x=>x.value===kind)?.label||kind;

export default function GlobalKnowledge(){
 const notes=useLiveQuery(()=>db.knowledgeNotes.orderBy('updatedAt').reverse().toArray(),[],[]);
 const links=useLiveQuery(()=>db.knowledgeLinks.toArray(),[],[]);
 const [selectedId,setSelectedId]=useState('');
 const [filter,setFilter]=useState<KnowledgeKind|'all'>('all');
 const [search,setSearch]=useState('');
 const [kind,setKind]=useState<KnowledgeKind>('concept');
 const [template,setTemplate]=useState(false);
 const [linkId,setLinkId]=useState('');
 const [previewId,setPreviewId]=useState('');
 const [error,setError]=useState('');
 const visible=notes.filter(n=>!n.deletedAt);
 const selected=visible.find(n=>n.id===selectedId)||visible[0]||null;
 const preview=visible.find(n=>n.id===previewId)||null;
 const listed=visible.filter(n=>(filter==='all'||n.kind===filter)&&[n.title,n.sources].join(' ').toLowerCase().includes(search.toLowerCase()));
 const incoming=links.filter(x=>x.toId===selected?.id);
 const outgoing=links.filter(x=>x.fromId===selected?.id);
 const wrap=(p:Promise<unknown>)=>{void p.then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e)));};
 async function add(){
  const doc=await createKnowledge(kind);
  if(template){
   const headings=KNOWLEDGE_KINDS.find(x=>x.value===kind)?.headings||[];
   await db.knowledgeNotes.update(doc.id,{content:{type:'doc',content:headings.flatMap(title=>[
    {type:'heading',attrs:{level:2},content:[{type:'text',text:title}]},{type:'paragraph'}
   ])},updatedAt:now()});
  }
  setSelectedId(doc.id);setPreviewId('');
 }
 async function attach(){
  if(!selected||!linkId||selected.id===linkId)return;
  if(outgoing.some(l=>l.toId===linkId))return;
  await db.knowledgeLinks.add({id:crypto.randomUUID(),fromId:selected.id,toId:linkId,createdAt:now()});setLinkId('');
 }
 const archived=notes.filter(n=>n.deletedAt);
 return <div className="research-workspace">
  <Header eyebrow="KNOWLEDGE VAULT" title="지식 보관함" description="사상가, 철학·사조, 문학 작품, 개념을 작성하고 출처와 연결 관계를 보존합니다."/>
  {error&&<p role="alert" className="graph-error">{error}</p>}
  <div className="knowledge-create">
   <label>새 자료 유형<select value={kind} onChange={e=>setKind(e.target.value as KnowledgeKind)}>{KNOWLEDGE_KINDS.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
   <label className="checkbox-line"><input type="checkbox" checked={template} onChange={e=>setTemplate(e.target.checked)}/> 제목 템플릿으로 시작</label>
   <Button onClick={()=>wrap(add())}><FilePlus size={15}/> 지식 문서 만들기</Button>
  </div>
  {!visible.length?<Empty title="지식 문서를 작성해 보세요" description="빈 문서에서 시작하거나 유형별 제목 템플릿을 활용할 수 있습니다." action={()=>wrap(add())}/>:
  <div className="research-master-detail">
   <aside className="research-list">
    <input aria-label="지식 문서 검색" placeholder="자료 검색…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select aria-label="지식 문서 유형 필터" value={filter} onChange={e=>setFilter(e.target.value as KnowledgeKind|'all')}>
     <option value="all">전체 자료</option>{KNOWLEDGE_KINDS.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}
    </select>
    <div className="research-list-items">{listed.map(note=><button type="button" key={note.id} className={selected?.id===note.id?'selected':''} onClick={()=>{setSelectedId(note.id);setPreviewId('');setLinkId('');}}>
     <small>{getLabel(note.kind)}</small><strong>{note.title||'제목 없음'}</strong>
    </button>)}</div>
    {archived.length>0&&<details className="research-trash"><summary>휴지통 ({archived.length})</summary>{archived.map(n=><div className="garden-link-row" key={n.id}>
     <span>{n.title}</span><button onClick={()=>wrap(db.knowledgeNotes.update(n.id,{deletedAt:0,updatedAt:now()}))}><Undo2 size={13}/> 복원</button>
    </div>)}</details>}
   </aside>
   {selected&&<article className="research-document">
    <div className="research-fields research-document-top">
     <label>문서 제목<input key={selected.id+'title'} defaultValue={selected.title} onBlur={e=>wrap(db.knowledgeNotes.update(selected.id,{title:e.target.value.trim()||'제목 없음',updatedAt:now()}))}/></label>
     <label>자료 유형<select value={selected.kind} onChange={e=>wrap(db.knowledgeNotes.update(selected.id,{kind:e.target.value as KnowledgeKind,updatedAt:now()}))}>
      {KNOWLEDGE_KINDS.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}
     </select></label>
    </div>
    <GlobalRichEditor key={selected.id} documentId={selected.id} content={selected.content} internalNotes={visible.map(n=>({id:n.id,title:n.title}))}
     onSave={content=>db.knowledgeNotes.update(selected.id,{content,updatedAt:now()})}
     onOpenLink={id=>setPreviewId(id)}/>
    <div className="research-fields">
     <label>출처 · 참고 링크<textarea key={selected.id+'sources'} defaultValue={selected.sources} rows={3} placeholder="서명, 저자, 페이지, 웹 링크…" onBlur={e=>wrap(db.knowledgeNotes.update(selected.id,{sources:e.target.value,updatedAt:now()}))}/></label>
    </div>
    <div className="research-doc-relations">
     <h3><Link2 size={15}/> 관련 지식</h3>
     <div className="research-actions"><select aria-label="연결할 지식 문서" value={linkId} onChange={e=>setLinkId(e.target.value)}>
      <option value="">관련 자료 선택</option>
      {visible.filter(n=>n.id!==selected.id).map(n=><option value={n.id} key={n.id}>{n.title}</option>)}
     </select><Button variant="soft" disabled={!linkId} onClick={()=>wrap(attach())}>연결</Button></div>
     {outgoing.map(link=><div className="garden-link-row" key={link.id}><button onClick={()=>setPreviewId(link.toId)}>{visible.find(n=>n.id===link.toId)?.title||'보관된 지식'}</button><button title="연결 해제" onClick={()=>wrap(db.knowledgeLinks.delete(link.id))}>×</button></div>)}
     <h4>이 문서를 참조하는 자료 ({incoming.length})</h4>
     {incoming.map(link=><button type="button" className="research-backlink" key={link.id} onClick={()=>setPreviewId(link.fromId)}>{visible.find(n=>n.id===link.fromId)?.title||'보관된 지식'}</button>)}
     {preview&&<div className="research-preview"><small>연결된 자료 미리보기 · {getLabel(preview.kind)}</small><strong>{preview.title}</strong>
      <p>{preview.sources||'출처 미입력'}</p><Button variant="soft" onClick={()=>{setSelectedId(preview.id);setPreviewId('');}}>원본 문서 열기</Button>
      <button type="button" onClick={()=>setPreviewId('')} aria-label="미리보기 닫기">닫기</button>
     </div>}
    </div>
    <Button variant="danger" onClick={()=>{if(confirm('이 지식 문서를 휴지통으로 이동하시겠습니까?'))wrap(db.knowledgeNotes.update(selected.id,{deletedAt:now(),updatedAt:now()}));}}><Trash2 size={14}/> 휴지통으로 이동</Button>
   </article>}
  </div>}
 </div>;
}
