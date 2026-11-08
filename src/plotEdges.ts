import { db, fresh, now, touch, type PlotEdge, type PlotEdgeType } from './data';

export const EDGE_TYPES: {value:PlotEdgeType;label:string}[]=[
 {value:'normal',label:'일반 진행'},
 {value:'conditional',label:'조건부 진행'},
 {value:'choice',label:'선택 분기'},
 {value:'return',label:'복귀'},
 {value:'optional',label:'선택적 방문'}
];

export type EdgeDraft={
 fromSceneId:string;
 toSceneId:string;
 type:PlotEdgeType;
 label:string;
 condition:string;
 note:string;
};
export const EMPTY_EDGE:EdgeDraft={fromSceneId:'',toSceneId:'',type:'normal',label:'',condition:'',note:''};

async function assertScene(projectId:string,sceneId:string,required:boolean){
 if(!sceneId&&!required)return;
 const scene=await db.scenes.get(sceneId);
 if(!scene||scene.projectId!==projectId||scene.deletedAt)throw Error('연결할 장면이 없거나 휴지통에 있습니다.');
}
function cleanDraft(d:EdgeDraft):EdgeDraft{
 if(!EDGE_TYPES.some(t=>t.value===d.type))throw Error('진행 관계 유형이 올바르지 않습니다.');
 return {fromSceneId:d.fromSceneId,toSceneId:d.toSceneId,type:d.type,label:d.label.trim(),condition:d.condition.trim(),note:d.note.trim()};
}
export async function createPlotEdge(projectId:string,draft:EdgeDraft):Promise<PlotEdge>{
 const d=cleanDraft(draft);
 await assertScene(projectId,d.fromSceneId,true);
 await assertScene(projectId,d.toSceneId,false);
 const edge:PlotEdge={...fresh(projectId),...d};
 await db.plotEdges.add(edge);
 await touch(projectId);
 return edge;
}
export async function updatePlotEdge(projectId:string,edgeId:string,draft:EdgeDraft){
 const d=cleanDraft(draft);
 const previous=await db.plotEdges.get(edgeId);
 if(!previous||previous.projectId!==projectId)throw Error('진행 관계를 찾을 수 없습니다.');
 await assertScene(projectId,d.fromSceneId,true);
 await assertScene(projectId,d.toSceneId,false);
 await db.plotEdges.update(edgeId,{...d,updatedAt:now()});
 await touch(projectId);
}
export async function deletePlotEdge(projectId:string,edgeId:string){
 const existing=await db.plotEdges.get(edgeId);
 if(!existing||existing.projectId!==projectId)throw Error('진행 관계를 찾을 수 없습니다.');
 await db.plotEdges.delete(edgeId);
 await touch(projectId);
}
/** Edges are independent of scene order and can link the same pair with distinct conditions. */
export function outgoing(edges:PlotEdge[],sceneId:string){return edges.filter(edge=>edge.fromSceneId===sceneId);}
export function incoming(edges:PlotEdge[],sceneId:string){return edges.filter(edge=>edge.toSceneId===sceneId);}
