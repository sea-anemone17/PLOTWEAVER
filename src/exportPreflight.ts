import type {Asset,ExportProfile,Handout,PlotEdge,Scene} from './data';

export type ExportWarning={code:string;message:string};
export function collectExportWarnings(profile:ExportProfile,handouts:Handout[],assets:Asset[],scenes:Scene[],edges:PlotEdge[]):ExportWarning[]{
 const warnings:ExportWarning[]=[];
 const sceneIds=new Set(scenes.filter(s=>!s.deletedAt).map(s=>s.id));
 const scope=profile.sceneIds===undefined?sceneIds:new Set(profile.sceneIds);
 if(profile.includeScenes){
  for(const id of scope)if(!sceneIds.has(id))warnings.push({code:'scene:'+id,message:'출력 대상으로 지정된 장면이 삭제되었거나 존재하지 않습니다.'});
  for(const edge of edges){
   if(!scope.has(edge.fromSceneId))continue;
   if(!sceneIds.has(edge.toSceneId))warnings.push({code:'edge:'+edge.id,message:'플롯 관계에 연결 대상 장면이 없습니다.'});
  }
 }
 if(profile.includeHandouts){
  const included=handouts.filter(h=>h.visibility==='player'||(profile.includePrivate&&h.visibility==='gm'));
  const available=new Set(assets.map(a=>a.id));
  for(const h of included)if(h.kind==='file'&&(!h.assetId||!available.has(h.assetId))){
   warnings.push({code:'asset:'+h.id,message:'핸드아웃 ‘'+h.title+'’의 첨부파일 원본이 누락되었습니다.'});
  }
  const draftCount=handouts.filter(h=>h.visibility==='draft').length;
  if(draftCount)warnings.push({code:'draft-handouts',message:'공개 범위가 미정인 핸드아웃 '+draftCount+'개는 DOCX에서 제외됩니다.'});
 }
 if(profile.includePrivate&&/배포|플레이어/.test(profile.name)){
  warnings.push({code:'private',message:'배포용 이름의 프로필에 GM 전용 정보가 포함되도록 설정되어 있습니다.'});
 }
 return warnings;
}
