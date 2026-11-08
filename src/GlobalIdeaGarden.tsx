import {useEffect,useMemo,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {GitBranch,Network,Plus,RotateCcw,Trash2,Undo2} from 'lucide-react';
import {db,now,type GlobalIdea} from './data';
import {addGlobalIdea,archiveIdeaTree,restoreIdeaTree,moveGlobalIdea,linkGlobalIdeas} from './researchData';
import {registerEditorFlusher,trackEditorWrite} from './saveBarrier';
import {Button,Empty,Header} from './UI';

type Positioned={node:GlobalIdea;depth:number;x:number;y:number};
function layoutIdeas(all:GlobalIdea[]):Positioned[]{
 const lookup=new Map(all.map(x=>[x.id,x]));
 const children=new Map<string|null,GlobalIdea[]>();
 for(const node of all){
  const parent=node.parentId&&lookup.has(node.parentId)?node.parentId:null;
  const list=children.get(parent)||[];list.push(node);children.set(parent,list);
 }
 for(const siblings of children.values())siblings.sort((a,b)=>a.order-b.order||a.createdAt-b.createdAt);
 const output:Positioned[]=[],seen=new Set<string>();
 const visit=(node:GlobalIdea,depth:number)=>{
  if(seen.has(node.id))return;
  seen.add(node.id);
  output.push({node,depth,x:20+depth*238,y:18+output.length*87});
  if(!node.collapsed)for(const child of children.get(node.id)||[])visit(child,depth+1);
 };
 for(const node of children.get(null)||[])visit(node,0);
 for(const node of all)if(!seen.has(node.id))visit(node,0);
 return output;
}
function IdeaFields({node}:{node:GlobalIdea}){
 const [draft,setDraft]=useState({title:node.title,body:node.body});
 const [status,setStatus]=useState('');
 const current=useRef(draft),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const save=async()=>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const values=current.current;
  if(values.title===node.title&&values.body===node.body)return;
  try{await db.globalIdeas.update(node.id,{...values,updatedAt:now()});setStatus('저장됨');}
  catch(e){setStatus('저장 실패');throw e;}
 };
 useEffect(()=>registerEditorFlusher('__global__',save),[node.id]);
 useEffect(()=>()=>{void save().catch(()=>undefined);},[node.id]);
 const update=(key:'title'|'body',value:string)=>{
  const next={...current.current,[key]:value};current.current=next;setDraft(next);setStatus('저장 대기');
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{const write=save();trackEditorWrite('__global__',write);void write.catch(()=>undefined);},500);
 };
 return <div className="research-fields">
  <label>아이디어 이름<input value={draft.title} onChange={e=>update('title',e.target.value)} onBlur={()=>{void save().catch(()=>undefined);}}/></label>
  <label>자유 메모<textarea rows={10} value={draft.body} onChange={e=>update('body',e.target.value)} onBlur={()=>{void save().catch(()=>undefined);}} placeholder="이 아이디어에서 떠오르는 내용을 자유롭게 적어 주세요."/></label>
  <small>{status||'선택한 노드의 제목과 메모를 양쪽 보기에서 공유합니다.'}</small>
 </div>;
}
export default function GlobalIdeaGarden(){
 const all=useLiveQuery(()=>db.globalIdeas.orderBy('createdAt').toArray(),[],[]);
 const links=useLiveQuery(()=>db.globalIdeaLinks.toArray(),[],[]);
 const [selectedId,setSelectedId]=useState('');
 const [mode,setMode]=useState<'tree'|'map'>('map');
 const [parentPick,setParentPick]=useState('');
 const [linkPick,setLinkPick]=useState('');
 const [error,setError]=useState('');
 const active=all.filter(node=>!node.deletedAt);
 const archived=all.filter(node=>!!node.deletedAt);
 const visible=useMemo(()=>layoutIdeas(active),[all]);
 const positions=new Map(visible.map(n=>[n.node.id,n]));
 const selected=active.find(x=>x.id===selectedId)||active[0]||null;
 const width=Math.max(700,...visible.map(p=>p.x+235));
 const height=Math.max(340,...visible.map(p=>p.y+82));
 const attempt=(promise:Promise<unknown>)=>{void promise.then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e)));};
 async function add(parentId:string|null=null){
  const item=await addGlobalIdea(parentId);setSelectedId(item.id);
 }
 async function move(){
  if(!selected)return;
  await moveGlobalIdea(selected.id,parentPick||null);setParentPick('');
 }
 async function link(){
  if(!selected||!linkPick)return;
  await linkGlobalIdeas(selected.id,linkPick);setLinkPick('');
 }
 const directChildren=active.filter(n=>n.parentId===selected?.id);
 return <div className="research-workspace">
  <Header eyebrow="IDEA GARDEN" title="아이디어 정원" description="같은 아이디어를 계층형 메모와 좌→우 마인드맵으로 살펴봅니다. 어느 보기에서나 같은 데이터를 수정합니다." action={()=>attempt(add())} actionText="+ 새 아이디어"/>
  {error&&<p role="alert" className="graph-error">{error}</p>}
  {!active.length?<Empty title="첫 아이디어를 심어 보세요" description="소재, 장면, 대사, 질문 등 어느 생각이든 좋습니다." action={()=>attempt(add())}/>:
  <div className="garden-shell">
   <div className="garden-main">
    <div className="garden-toolbar">
     <button type="button" className={mode==='map'?'selected':''} onClick={()=>setMode('map')}><Network size={15}/> 마인드맵</button>
     <button type="button" className={mode==='tree'?'selected':''} onClick={()=>setMode('tree')}><GitBranch size={15}/> 계층 메모</button>
     <span className="grow"/>
     <Button variant="soft" onClick={()=>attempt(add(selected?.id||null))}><Plus size={14}/> 하위 아이디어</Button>
    </div>
    {mode==='tree'?<div className="garden-tree">{visible.map(({node,depth})=><div className="garden-tree-row" key={node.id} style={{paddingLeft:12+Math.min(depth,12)*20}}>
     <button type="button" className={selected?.id===node.id?'selected':''} onClick={()=>setSelectedId(node.id)}>
      <small>{node.collapsed?'▸':'▾'}</small><strong>{node.title||'제목 없는 아이디어'}</strong><span>{node.body.slice(0,70)}</span>
     </button>
     <button type="button" title="하위 항목 접기/펼치기" onClick={()=>attempt(db.globalIdeas.update(node.id,{collapsed:!node.collapsed,updatedAt:now()}))}>{node.collapsed?'펼치기':'접기'}</button>
    </div>)}</div>:
    <div className="garden-scroll"><div className="garden-stage" style={{width,height}}>
     <svg width={width} height={height} className="garden-lines" aria-hidden="true">
      {visible.map(entry=>{const parent=entry.node.parentId?positions.get(entry.node.parentId):undefined;
       if(!parent)return null;
       return <path key={entry.node.id} d={`M${parent.x+185} ${parent.y+28} C${parent.x+205} ${parent.y+28} ${entry.x-20} ${entry.y+28} ${entry.x} ${entry.y+28}`} stroke="#aab5c9" strokeWidth="2" fill="none"/>;
      })}
      {links.map(link=>{const a=positions.get(link.sourceId),b=positions.get(link.targetId);
       if(!a||!b)return null;
       return <path key={link.id} d={`M${a.x+92} ${a.y+52} Q${(a.x+b.x)/2+90} ${Math.max(a.y,b.y)+95} ${b.x+92} ${b.y+52}`} stroke="#b3a2c8" strokeDasharray="5 6" strokeWidth="1.5" fill="none"/>;
      })}
     </svg>
     {visible.map(({node,x,y})=><button type="button" className={'garden-node'+(selected?.id===node.id?' selected':'')} key={node.id} style={{left:x,top:y}} onClick={()=>setSelectedId(node.id)} title={node.title}>
      <strong>{node.title||'제목 없는 아이디어'}</strong><small>{node.body?node.body.slice(0,45):'메모를 작성해 보세요'}</small>
     </button>)}
    </div></div>}
   </div>
   <aside className="garden-detail">
    <div className="eyebrow">IDEA DETAIL</div>
    <h3>{selected?.title||'아이디어'}</h3>
    {selected&&<IdeaFields key={selected.id} node={selected}/>}
    {selected&&<div className="research-actions">
     <Button variant="soft" onClick={()=>attempt(add(selected.id))}><Plus size={14}/> 자식 추가</Button>
     <Button variant="soft" onClick={()=>attempt(db.globalIdeas.update(selected.id,{collapsed:!selected.collapsed,updatedAt:now()}))}>{selected.collapsed?'하위 펼치기':'하위 접기'}</Button>
    </div>}
    {selected&&<div className="research-fields">
     <label>상위 아이디어 변경
      <select value={parentPick} onChange={e=>setParentPick(e.target.value)}>
       <option value="">최상위로 이동</option>
       {active.filter(n=>n.id!==selected.id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
      </select>
     </label>
     <Button variant="soft" onClick={()=>attempt(move())}>위치 변경</Button>
     <label>교차 참조 추가<select value={linkPick} onChange={e=>setLinkPick(e.target.value)}>
       <option value="">연결할 아이디어 선택</option>
       {active.filter(n=>n.id!==selected.id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
      </select></label>
     <Button variant="soft" disabled={!linkPick} onClick={()=>attempt(link())}>아이디어 연결</Button>
     <small>하위 항목 {directChildren.length}개 · 교차 참조 {links.filter(l=>l.sourceId===selected.id||l.targetId===selected.id).length}개</small>
     {links.filter(l=>l.sourceId===selected.id||l.targetId===selected.id).map(l=><div className="garden-link-row" key={l.id}>
      <button onClick={()=>setSelectedId(l.sourceId===selected.id?l.targetId:l.sourceId)}>{active.find(x=>x.id===(l.sourceId===selected.id?l.targetId:l.sourceId))?.title||'삭제된 아이디어'}</button>
      <button title="연결만 삭제" onClick={()=>attempt(db.globalIdeaLinks.delete(l.id))}>×</button>
     </div>)}
    </div>}
    {selected&&<Button variant="danger" onClick={()=>{if(confirm('이 아이디어와 하위 항목을 휴지통으로 이동할까요?'))attempt(archiveIdeaTree(selected.id).then(()=>setSelectedId('')));}}><Trash2 size={14}/> 하위 포함 휴지통</Button>}
    {archived.length>0&&<details className="research-trash"><summary>아이디어 휴지통 ({archived.length})</summary>
     {archived.filter(x=>!x.parentId||!archived.some(p=>p.id===x.parentId)).map(x=><div className="garden-link-row" key={x.id}><span>{x.title}</span><button onClick={()=>attempt(restoreIdeaTree(x.id))}><Undo2 size={13}/> 복원</button></div>)}
    </details>}
   </aside>
  </div>}
 </div>;
}
