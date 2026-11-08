import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, FilePenLine, GitBranch, RotateCcw, Trash2, Plus, Save } from 'lucide-react';
import { db, fresh, now, touch, type Scene, type PlotEdge, type PlotEdgeType } from './data';
import { autoLayout, edgePath, graphBounds, NODE_WIDTH, NODE_HEIGHT, type NodePosition } from './plotLayout';
import { EDGE_TYPES, EMPTY_EDGE, createPlotEdge, updatePlotEdge, deletePlotEdge, type EdgeDraft } from './plotEdges';
import { Button } from './UI';

type Props={
 projectId:string;
 scenes:Scene[];
 edges:PlotEdge[];
 onEditScene:(scene:Scene)=>void;
 onWriteScene:(sceneId:string)=>void;
};
type Drag={
 id:string;clientX:number;clientY:number;original:NodePosition;current:NodePosition;moved:boolean;
};

export default function PlotGraph({projectId,scenes,edges,onEditScene,onWriteScene}:Props){
 const layouts=useLiveQuery(()=>db.plotLayouts.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const [dragPositions,setDragPositions]=useState<Record<string,NodePosition>>({});
 const [selectedSceneId,setSelectedSceneId]=useState('');
 const [selectedEdgeId,setSelectedEdgeId]=useState('');
 const [draft,setDraft]=useState<EdgeDraft>({...EMPTY_EDGE});
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const drag=useRef<Drag|null>(null);
 const auto=useMemo(()=>autoLayout(scenes,edges),[scenes,edges]);
 const positions=useMemo(()=>{
  const result={...auto};
  for(const layout of layouts)if(result[layout.sceneId])result[layout.sceneId]={x:layout.x,y:layout.y};
  return {...result,...dragPositions};
 },[auto,layouts,dragPositions]);
 const size=graphBounds(positions);
 const activeScene=scenes.find(scene=>scene.id===selectedSceneId);
 const editedEdge=edges.find(edge=>edge.id===selectedEdgeId);
 const nameOf=(id:string)=>scenes.find(scene=>scene.id===id)?.title||'연결 대상 없음';
 const edgeType=(value:PlotEdgeType)=>EDGE_TYPES.find(t=>t.value===value)?.label||value;

 function selectEdge(edge:PlotEdge){
  setSelectedEdgeId(edge.id);
  setSelectedSceneId(edge.fromSceneId);
  setDraft({fromSceneId:edge.fromSceneId,toSceneId:edge.toSceneId,type:edge.type,label:edge.label,condition:edge.condition,note:edge.note});
  setError('');
 }
 function newEdge(fromSceneId=selectedSceneId||scenes[0]?.id||''){
  setSelectedEdgeId('');
  setDraft({...EMPTY_EDGE,fromSceneId});
  setError('');
 }
 async function save(){
  setBusy(true);setError('');
  try{
   if(selectedEdgeId)await updatePlotEdge(projectId,selectedEdgeId,draft);
   else{
    const edge=await createPlotEdge(projectId,draft);
    setSelectedEdgeId(edge.id);
   }
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(false);}
 }
 async function remove(){
  if(!editedEdge||!confirm('이 진행 관계만 삭제하시겠습니까? 장면과 원고는 삭제되지 않습니다.'))return;
  setBusy(true);setError('');
  try{await deletePlotEdge(projectId,editedEdge.id);newEdge(editedEdge.fromSceneId);}
  catch(cause){setError(String(cause));}
  finally{setBusy(false);}
 }
 async function resetAll(){
  if(!confirm('직접 배치한 노드 위치를 모두 초기화하고 자동 정렬하시겠습니까? 진행 관계는 유지됩니다.'))return;
  try{
   await db.plotLayouts.where('projectId').equals(projectId).delete();
   setDragPositions({});
   await touch(projectId);
  }catch(cause){setError(String(cause));}
 }
 async function resetOne(){
  if(!selectedSceneId)return;
  try{
   await db.plotLayouts.where('sceneId').equals(selectedSceneId).delete();
   setDragPositions(prev=>{const next={...prev};delete next[selectedSceneId];return next;});
   await touch(projectId);
  }catch(cause){setError(String(cause));}
 }
 function startDrag(event:React.PointerEvent<HTMLButtonElement>,id:string){
  if(event.button!==0||!positions[id])return;
  event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={id,clientX:event.clientX,clientY:event.clientY,original:positions[id],current:positions[id],moved:false};
  setSelectedSceneId(id);
 }
 function moveDrag(event:React.PointerEvent<HTMLButtonElement>){
  const state=drag.current;
  if(!state)return;
  const dx=event.clientX-state.clientX,dy=event.clientY-state.clientY;
  if(Math.abs(dx)+Math.abs(dy)>5)state.moved=true;
  if(!state.moved)return;
  state.current={x:Math.max(8,Math.round(state.original.x+dx)),y:Math.max(8,Math.round(state.original.y+dy))};
  setDragPositions(prev=>({...prev,[state.id]:state.current}));
 }
 async function endDrag(){
  const state=drag.current;drag.current=null;
  if(!state?.moved)return;
  try{
   await db.transaction('rw',db.plotLayouts,async()=>{
    const old=await db.plotLayouts.where('sceneId').equals(state.id).first();
    await db.plotLayouts.put({...old,...fresh(projectId),id:old?.id||crypto.randomUUID(),sceneId:state.id,x:state.current.x,y:state.current.y,createdAt:old?.createdAt||now()});
   });
   await touch(projectId);
  }catch(cause){setError('노드 위치 저장 실패: '+String(cause));}
 }
 const shownEdges=edges.filter(edge=>positions[edge.fromSceneId]&&positions[edge.toSceneId]);
 return <div className="plot-graph-layout">
  <section className="plot-graph-left" aria-label="전체 플롯 관계도">
   <div className="graph-tools">
    <span>장면 {scenes.length}개 · 연결 {edges.length}개</span>
    <button type="button" onClick={()=>void resetAll()}><RotateCcw size={14}/> 전체 자동 정렬</button>
    <button type="button" onClick={()=>newEdge()}><Plus size={14}/> 연결 추가</button>
   </div>
   <div className="plot-graph-scroll">
    <div className="plot-graph-stage" style={{width:size.width,height:size.height}}>
     <svg className="plot-connections" width={size.width} height={size.height} aria-hidden="true">
      <defs><marker id="pw-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0 L7 3.5 L0 7 z" fill="#7987a5"/></marker></defs>
      {shownEdges.map(edge=>{
       const a=positions[edge.fromSceneId],b=positions[edge.toSceneId];
       return <path key={edge.id} className="plot-edge-path" d={edgePath(a,b)} markerEnd="url(#pw-arrow)" strokeDasharray={edge.type==='optional'||edge.type==='return'?'6 5':undefined}/>;
      })}
      {edges.filter(edge=>positions[edge.fromSceneId]&&!edge.toSceneId).map(edge=>{
       const a=positions[edge.fromSceneId];
       return <g key={edge.id}><path className="plot-edge-path plot-edge-pending" d={`M${a.x+NODE_WIDTH} ${a.y+NODE_HEIGHT/2} h70`} strokeDasharray="5 5"/><circle cx={a.x+NODE_WIDTH+74} cy={a.y+NODE_HEIGHT/2} r="5" fill="#b3b6c3"/></g>;
      })}
     </svg>
     {scenes.map(scene=>{
      const p=positions[scene.id];if(!p)return null;
      return <button key={scene.id} type="button" className={'graph-scene-node'+(selectedSceneId===scene.id?' selected':'')} style={{left:p.x,top:p.y,width:NODE_WIDTH,height:NODE_HEIGHT}}
       onPointerDown={event=>startDrag(event,scene.id)} onPointerMove={moveDrag} onPointerUp={()=>void endDrag()} onPointerCancel={()=>void endDrag()}
       onClick={()=>setSelectedSceneId(scene.id)} onDoubleClick={()=>onEditScene(scene)}
       title={scene.title+' · 드래그하여 배치 / 두 번 눌러 정보 편집'}>
       <small>{scene.stage||'장면'}</small><strong>{scene.title||'이름 없는 장면'}</strong>
      </button>;
     })}
    </div>
   </div>
   <p className="muted small">노드를 이동하면 위치만 저장됩니다. 장면 순서와 연결선은 변경되지 않습니다. 장면은 두 번 클릭하여 편집할 수 있습니다.</p>
  </section>
  <aside className="plot-graph-panel">
   {activeScene&&<div className="graph-selected-scene">
    <div className="eyebrow">선택한 장면</div><h3>{activeScene.title}</h3>
    <p>{activeScene.purpose||'목적 미작성'}</p>
    <div className="graph-panel-actions">
     <button type="button" onClick={()=>onWriteScene(activeScene.id)}><FilePenLine size={14}/> 원고 열기</button>
     <button type="button" onClick={()=>onEditScene(activeScene)}>장면 편집</button>
     <button type="button" onClick={()=>void resetOne()}>위치 초기화</button>
    </div>
   </div>}
   <div className="eyebrow">진행 관계 관리</div>
   <h3>{selectedEdgeId?'선택한 연결 편집':'새 연결 추가'}</h3>
   <div className="graph-form">
    <label>출발 장면
     <select value={draft.fromSceneId} onChange={e=>setDraft({...draft,fromSceneId:e.target.value})}>
      <option value="">출발 장면 선택</option>
      {scenes.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
     </select>
    </label>
    <label>도착 장면
     <select value={draft.toSceneId} onChange={e=>setDraft({...draft,toSceneId:e.target.value})}>
      <option value="">아직 결정하지 않음</option>
      {scenes.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
     </select>
    </label>
    <label>관계 유형
     <select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as PlotEdgeType})}>
      {EDGE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
     </select>
    </label>
    <label>선택지·연결 이름 (선택)
     <input value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})} placeholder="예: 생존자를 구한다"/>
    </label>
    <label>진행 조건 (선택)
     <textarea rows={2} value={draft.condition} onChange={e=>setDraft({...draft,condition:e.target.value})} placeholder="예: 기록을 발견했을 때"/>
    </label>
    <label>GM 메모 (선택)
     <textarea rows={2} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/>
    </label>
    {error&&<p className="graph-error" role="alert">{error}</p>}
    <div className="graph-panel-actions">
     <Button disabled={busy||!draft.fromSceneId} onClick={()=>void save()}><Save size={14}/> {selectedEdgeId?'연결 수정':'연결 생성'}</Button>
     {editedEdge&&<Button variant="danger" disabled={busy} onClick={()=>void remove()}><Trash2 size={14}/> 삭제</Button>}
     {selectedEdgeId&&<Button variant="soft" onClick={()=>newEdge()}><Plus size={14}/> 새 연결</Button>}
    </div>
   </div>
   <div className="graph-edge-list"><h4>연결 목록</h4>
    {edges.length?edges.map(edge=><button type="button" key={edge.id} className={'graph-edge-item'+(selectedEdgeId===edge.id?' selected':'')} onClick={()=>selectEdge(edge)}>
     <span>{nameOf(edge.fromSceneId)} <ArrowRight size={12}/> {edge.toSceneId?nameOf(edge.toSceneId):'미정'}</span>
     <small>{edgeType(edge.type)}{edge.label?' · '+edge.label:''}</small>
    </button>):<p className="muted small">아직 연결된 장면이 없습니다. 원하는 경로부터 추가해 보세요.</p>}
   </div>
  </aside>
 </div>;
}
