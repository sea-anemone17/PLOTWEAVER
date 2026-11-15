import type { PlotEdge, Scene } from './data';
import { incoming, outgoing } from './plotEdges';

type Props={
 sceneId:string;
 scenes:Scene[];
 edges:PlotEdge[];
 onNavigate?:(sceneId:string)=>void;
};
export default function PlotMiniGraph({sceneId,scenes,edges,onNavigate}:Props){
 const lookup=new Map(scenes.map(scene=>[scene.id,scene]));
 const from=incoming(edges,sceneId).filter(edge=>lookup.has(edge.fromSceneId));
 const to=outgoing(edges,sceneId).filter(edge=>edge.toSceneId&&lookup.has(edge.toSceneId));
 const origin=lookup.get(sceneId);
 const name=(id:string)=>lookup.get(id)?.title||'연결 대상 없음';
 const earlier=from.slice(0,2),later=to.slice(0,3);
 return <div className="plot-mini">
  <svg viewBox="0 0 326 155" role="img" aria-label="현재 장면과 직접 연결된 앞뒤 장면의 미니 관계도">
   <g stroke="#8491a9" strokeWidth="1.4" fill="none">
    {earlier.map((edge,i)=><path key={edge.id} d={`M94 ${earlier.length===1?78:51+i*56} L119 78`}/>)}
    {later.map((edge,i)=><path key={edge.id} d={`M215 78 L239 ${later.length===1?78:28+i*51}`}/>)}
   </g>
   {earlier.map((edge,i)=><g key={edge.id}>
    <rect x="3" y={(earlier.length===1?78:51+i*56)-17} width="91" height="34" rx="6" fill="#e8eaf0" stroke="#cdd1dd"/>
    <text x="48" y={(earlier.length===1?78:51+i*56)+4} fontSize="10" textAnchor="middle" fill="#41475a">{name(edge.fromSceneId).slice(0,8)}</text>
   </g>)}
   <rect x="119" y="55" width="96" height="46" rx="7" fill="#dce8df" stroke="#9cb8a4"/>
   <text x="167" y="82" fontSize="11" textAnchor="middle" fill="#25332a">{(origin?.title||'현재 장면').slice(0,8)}</text>
   {later.map((edge,i)=><g key={edge.id}>
    <rect x="239" y={(later.length===1?78:28+i*51)-17} width="84" height="34" rx="6" fill="#e4e9f5" stroke="#b7c6e2"/>
    <text x="281" y={(later.length===1?78:28+i*51)+4} fontSize="10" textAnchor="middle" fill="#323c58">{name(edge.toSceneId).slice(0,7)}</text>
   </g>)}
  </svg>
  <p className="muted small">진입 {from.length}개 · 다음 {to.length}개{from.length>2||to.length>3?' · 일부만 미리보기로 표시':''}</p>
  {to.length>0&&<div className="mini-neighbors">{to.map(edge=><button type="button" key={edge.id} onClick={()=>onNavigate?.(edge.toSceneId)} title={name(edge.toSceneId)}>→ {name(edge.toSceneId)}{edge.label?' · '+edge.label:''}</button>)}</div>}
 </div>;
}
