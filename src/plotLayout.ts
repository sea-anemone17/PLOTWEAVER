import type { PlotEdge, Scene } from './data';

export type NodePosition={x:number;y:number};
export const NODE_WIDTH=180, NODE_HEIGHT=70;
export const H_GAP=270, V_GAP=124;

/**
 * Deterministic left-to-right default layout.
 * Breadth-first traversal uses a visited set, so cycles never cause infinite loops.
 * Edge direction and manual positions are never mutated by auto-layout.
 */
export function autoLayout(scenes:Scene[],edges:PlotEdge[]):Record<string,NodePosition>{
 const active=[...scenes].filter(s=>!s.deletedAt).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
 const byId=new Set(active.map(s=>s.id));
 const adjacency=new Map(active.map(s=>[s.id,[] as string[]]));
 const inbound=new Map(active.map(s=>[s.id,0]));
 for(const edge of edges){
  if(byId.has(edge.fromSceneId)&&byId.has(edge.toSceneId)){
   adjacency.get(edge.fromSceneId)!.push(edge.toSceneId);
   inbound.set(edge.toSceneId,(inbound.get(edge.toSceneId)||0)+1);
  }
 }
 const visited=new Set<string>();
 const layers=new Map<number,string[]>();
 const walk=(start:string)=>{
  const queue:[string,number][]=[[start,0]];
  visited.add(start);
  for(let index=0;index<queue.length;index++){
   const [id,depth]=queue[index];
   const layer=layers.get(depth)||[];
   layer.push(id);
   layers.set(depth,layer);
   for(const next of adjacency.get(id)||[])if(!visited.has(next)){
    visited.add(next);queue.push([next,depth+1]);
   }
  }
 };
 for(const scene of active)if((inbound.get(scene.id)||0)===0&&!visited.has(scene.id))walk(scene.id);
 for(const scene of active)if(!visited.has(scene.id))walk(scene.id);
 const positions:Record<string,NodePosition>={};
 for(const [depth,ids] of layers){
  ids.forEach((id,index)=>{positions[id]={x:34+depth*H_GAP,y:34+index*V_GAP};});
 }
 return positions;
}

export function graphBounds(positions:Record<string,NodePosition>){
 const nodes=Object.values(positions);
 return {
  width:Math.max(690,...nodes.map(node=>node.x+NODE_WIDTH+90)),
  height:Math.max(340,...nodes.map(node=>node.y+NODE_HEIGHT+60))
 };
}

export function edgePath(a:NodePosition,b:NodePosition):string{
 const startX=a.x+NODE_WIDTH,startY=a.y+NODE_HEIGHT/2,endX=b.x,endY=b.y+NODE_HEIGHT/2;
 if(endX>startX+45){
  const bend=Math.max(45,(endX-startX)*.48);
  return `M ${startX} ${startY} C ${startX+bend} ${startY} ${endX-bend} ${endY} ${endX} ${endY}`;
 }
 const lift=startY===endY?60:Math.min(105,Math.abs(startY-endY)+30);
 return `M ${startX} ${startY} C ${startX+75} ${startY-lift} ${endX-75} ${endY-lift} ${endX} ${endY}`;
}
