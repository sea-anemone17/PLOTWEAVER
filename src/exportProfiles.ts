import {db,fresh,now,type ExportProfile} from './data';

export type ExportPreset='gm'|'player'|'review';
export const FONT_OPTIONS=['맑은 고딕','나눔고딕','바탕','Arial','Times New Roman'];
export function profilePreset(projectId:string,preset:ExportPreset):ExportProfile{
 const common={...fresh(projectId),fontFamily:'맑은 고딕',fontSize:11,pageMargin:1440,includeLegacy:true,includeScenes:true,includeHandouts:true,sceneIds:undefined};
 if(preset==='player')return {...common,name:'배포용',includePrivate:false,includeGMResources:false};
 if(preset==='review')return {...common,name:'검토용',includePrivate:false,includeGMResources:false,includeHandouts:false};
 return {...common,name:'GM 진행용',includePrivate:true,includeGMResources:true};
}
export function validateExportProfile(profile:ExportProfile){
 if(!profile.name.trim())throw Error('출력 프로필 이름이 필요합니다.');
 if(profile.sceneIds!==undefined&&(!Array.isArray(profile.sceneIds)||profile.sceneIds.some(id=>typeof id!=='string')))throw Error('장면 선택 정보가 올바르지 않습니다.');
 if(!FONT_OPTIONS.includes(profile.fontFamily))throw Error('지원하지 않는 글꼴입니다.');
 if(!Number.isFinite(profile.fontSize)||profile.fontSize<8||profile.fontSize>22)throw Error('본문 크기는 8~22pt로 설정해 주세요.');
 if(!Number.isFinite(profile.pageMargin)||profile.pageMargin<720||profile.pageMargin>2880)throw Error('여백은 0.5~2인치 사이로 설정해 주세요.');
}
export async function addExportProfile(projectId:string,preset:ExportPreset){
 if(!await db.projects.get(projectId))throw Error('프로젝트가 없습니다.');
 const profile=profilePreset(projectId,preset);
 await db.exportProfiles.add(profile);return profile;
}
export async function updateExportProfile(profile:ExportProfile){
 validateExportProfile(profile);
 const current=await db.exportProfiles.get(profile.id);
 if(!current||current.projectId!==profile.projectId)throw Error('출력 프로필을 찾을 수 없습니다.');
 await db.exportProfiles.put({...profile,name:profile.name.trim(),updatedAt:now()});
}
