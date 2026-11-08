import JSZip from 'jszip';
import {db,downloadBlob,makeBackup,restoreBackup,uid,type Asset,type Backup} from './data';
import {flushProjectEdits} from './saveBarrier';
import {makeResearchBackup,importResearchBackup,validateResearchBackup,type ResearchBackup} from './researchData';

const MAX_FILE=20*1024*1024;
const MAX_TOTAL=250*1024*1024;
const MAX_ARCHIVE=300*1024*1024;
const MAX_ENTRIES=1200;
const TYPES=new Set(['image/png','image/jpeg','image/webp','application/pdf']);

type AssetItem={id:string;projectId:string;name:string;mime:string;size:number;path:string;sha256:string};
type ProjectPackage={format:'plotweaver-package';version:1;scope:'project'|'workspace';createdAt:string;projects:{path:string;projectId:string}[];researchPath?:string;assets:AssetItem[]};
function hex(bytes:Uint8Array){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(bytes:Uint8Array){
 const hash=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
 return hex(new Uint8Array(hash));
}
function safeTitle(title:string){return (title||'PLOTWEAVER').replace(/[\\/:*?"<>|]/g,'_').slice(0,80);}
async function addAsset(zip:JSZip,asset:Asset):Promise<AssetItem>{
 if(!TYPES.has(asset.mime)||asset.size<0||asset.size>MAX_FILE||asset.blob.size!==asset.size)throw Error(asset.name+' 첨부파일의 형식이나 크기가 허용 범위 밖입니다.');
 const bytes=new Uint8Array(await asset.blob.arrayBuffer());
 const path='assets/'+asset.id;
 zip.file(path,bytes,{binary:true,compression:'DEFLATE'});
 return {id:asset.id,projectId:asset.projectId,name:asset.name,mime:asset.mime,size:asset.size,path,sha256:await sha256(bytes)};
}
export async function buildProjectPackage(projectId:string):Promise<Blob>{
 await flushProjectEdits(projectId);
 const backup=await makeBackup(projectId);
 const assets=await db.assets.where('projectId').equals(projectId).toArray();
 if(assets.reduce((sum,item)=>sum+item.size,0)>MAX_TOTAL)throw Error('첨부파일 총 크기가 250MB를 초과합니다.');
 const zip=new JSZip();
 zip.file('projects/0.json',JSON.stringify(backup));
 const manifest:ProjectPackage={format:'plotweaver-package',version:1,scope:'project',createdAt:new Date().toISOString(),
  projects:[{path:'projects/0.json',projectId}],assets:[]};
 for(const asset of assets)manifest.assets.push(await addAsset(zip,asset));
 zip.file('manifest.json',JSON.stringify(manifest,null,2));
 return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
}
export async function downloadProjectPackage(projectId:string){
 const project=await db.projects.get(projectId);
 if(!project)throw Error('백업할 프로젝트가 없습니다.');
 const blob=await buildProjectPackage(projectId);
 downloadBlob(blob,safeTitle(project.title)+'.plotweaver.zip');
}
export async function buildWorkspacePackage():Promise<Blob>{
 const projects=await db.projects.toArray();
 for(const p of projects)await flushProjectEdits(p.id);
 await flushProjectEdits('__global__');
 const zip=new JSZip();
 const manifest:ProjectPackage={format:'plotweaver-package',version:1,scope:'workspace',createdAt:new Date().toISOString(),projects:[],researchPath:'research.json',assets:[]};
 let total=0;
 for(let i=0;i<projects.length;i++){
  const project=projects[i],backup=await makeBackup(project.id);
  const path='projects/'+i+'.json';
  zip.file(path,JSON.stringify(backup));
  manifest.projects.push({path,projectId:project.id});
  const assets=await db.assets.where('projectId').equals(project.id).toArray();
  for(const asset of assets){
   total+=asset.size;
   if(total>MAX_TOTAL)throw Error('전체 첨부파일 크기가 250MB를 초과합니다. 개별 프로젝트 백업을 이용해 주세요.');
   manifest.assets.push(await addAsset(zip,asset));
  }
 }
 const research=await makeResearchBackup();
 zip.file('research.json',JSON.stringify(research));
 zip.file('manifest.json',JSON.stringify(manifest,null,2));
 return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
}
export async function downloadWorkspacePackage(){
 const blob=await buildWorkspacePackage();
 downloadBlob(blob,'PLOTWEAVER-전체-작업공간.plotweaver.zip');
}
async function parsePackage(file:Blob){
 if(file.size>MAX_ARCHIVE)throw Error('백업 파일이 300MB를 초과합니다.');
 const zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});
 const entries=Object.values(zip.files);
 if(entries.length>MAX_ENTRIES)throw Error('백업에 너무 많은 파일이 포함되어 있습니다.');
 // Validate filenames and estimated expanded sizes before extracting file bodies.
 let estimated=0;
 for(const entry of entries){
  if(entry.dir)continue;
  if(entry.name.startsWith('/')||entry.name.includes('\\')||entry.name.split('/').includes('..'))throw Error('안전하지 않은 ZIP 파일 경로가 있습니다.');
  const data=entry as unknown as {_data?:{uncompressedSize?:number}};
  const size=data._data?.uncompressedSize;
  if(typeof size==='number'){
   if(size>MAX_TOTAL)throw Error('압축 해제 파일이 허용 크기를 초과합니다.');
   estimated+=size;
  }
 }
 if(estimated>MAX_TOTAL+50*1024*1024)throw Error('백업의 압축 해제 크기가 너무 큽니다.');
 const manifestFile=zip.file('manifest.json');
 if(!manifestFile)throw Error('ZIP에 백업 정보가 없습니다.');
 const raw=await manifestFile.async('string');
 if(raw.length>2000000)throw Error('백업 정보가 너무 큽니다.');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('백업 정보가 손상되었습니다.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('백업 정보 형식이 잘못되었습니다.');
 const m=value as ProjectPackage;
 if(m.format!=='plotweaver-package'||m.version!==1||(m.scope!=='project'&&m.scope!=='workspace')||!Array.isArray(m.projects)||!Array.isArray(m.assets))throw Error('지원하지 않는 ZIP 백업 형식입니다.');
 if(m.scope==='project'&&m.projects.length!==1)throw Error('프로젝트 ZIP 백업의 목록이 올바르지 않습니다.');
 if(m.projects.length>300||m.assets.length>1000)throw Error('백업에 포함된 항목이 너무 많습니다.');
 const seen=new Set<string>();
 const expected=new Set(['manifest.json']);
 const projects:{backup:Backup;assets:Asset[]}[]=[];
 for(const ref of m.projects){
  if(!ref||typeof ref.path!=='string'||!/^projects\/[0-9]+\.json$/.test(ref.path)||typeof ref.projectId!=='string'||!zip.file(ref.path)||expected.has(ref.path))throw Error('프로젝트 백업 경로가 잘못되었습니다.');
  expected.add(ref.path);
  const text=await zip.file(ref.path)!.async('string');
  if(text.length>60000000)throw Error('프로젝트 데이터가 너무 큽니다.');
  const {validateBackup}=await import('./data');
  const backup=validateBackup(text);
  if(backup.project.id!==ref.projectId||seen.has(ref.projectId))throw Error('프로젝트 식별자가 중복되었거나 일치하지 않습니다.');
  seen.add(ref.projectId);
  projects.push({backup,assets:[]});
 }
 let total=0;
 const assetIds=new Set<string>();
 for(const meta of m.assets){
  if(!meta||typeof meta.id!=='string'||typeof meta.projectId!=='string'||typeof meta.name!=='string'||typeof meta.path!=='string'||typeof meta.sha256!=='string'||typeof meta.size!=='number'||!TYPES.has(meta.mime)||meta.size<0||meta.size>MAX_FILE)throw Error('첨부파일 메타데이터가 잘못되었습니다.');
  if(!seen.has(meta.projectId)||assetIds.has(meta.id)||meta.path!=='assets/'+meta.id||!zip.file(meta.path)||expected.has(meta.path))throw Error('첨부파일 목록이 중복되었거나 연결이 잘못되었습니다.');
  assetIds.add(meta.id);expected.add(meta.path);
  total+=meta.size;if(total>MAX_TOTAL)throw Error('첨부파일 전체 크기가 250MB를 초과합니다.');
  const bytes=await zip.file(meta.path)!.async('uint8array');
  if(bytes.byteLength!==meta.size||await sha256(bytes)!==meta.sha256)throw Error(meta.name+' 첨부파일이 손상되었습니다.');
  const project=projects.find(p=>p.backup.project.id===meta.projectId)!;
  project.assets.push({id:meta.id,projectId:meta.projectId,name:meta.name,mime:meta.mime,size:meta.size,blob:new Blob([bytes as BlobPart],{type:meta.mime}),createdAt:Date.now(),updatedAt:Date.now()});
 }
 for(const p of projects){
  const list=p.backup.assetManifest||[];
  if(list.length!==p.assets.length||list.some(item=>!p.assets.some(a=>a.id===item.id&&a.name===item.name&&a.size===item.size&&a.mime===item.mime)))throw Error('프로젝트 데이터와 첨부파일 목록이 일치하지 않습니다.');
 }
 let research:ResearchBackup|null=null;
 if(m.scope==='workspace'){
  if(m.researchPath!=='research.json'||!zip.file('research.json'))throw Error('전체 작업 공간의 연구 자료가 누락되었습니다.');
  expected.add('research.json');
  const text=await zip.file('research.json')!.async('string');
  research=validateResearchBackup(text);
 }else if(m.researchPath)throw Error('프로젝트 백업에 예상하지 않은 연구 자료가 있습니다.');
 // Reject unknown payloads; restores must not execute or unexpectedly store foreign files.
 for(const entry of entries)if(!entry.dir&&!expected.has(entry.name))throw Error('등록되지 않은 ZIP 파일이 포함되어 있습니다.');
 return {projects,research};
}
export async function restorePackage(file:Blob){
 const contents=await parsePackage(file);
 // The whole import is transactional. If any project is invalid, no part is committed.
 const restored=await db.transaction('rw',db.tables,async()=>{
  const researchMap=contents.research?(await importResearchBackup(JSON.stringify(contents.research))).idMap:{};
  const result:{id:string;title:string}[]=[];
  for(const item of contents.projects){
   const p=await restoreBackup(JSON.stringify(item.backup),false,item.assets);
   // Reconnect pinned snapshots to their newly imported global theme/revision.
   // Standalone project backups intentionally keep only the frozen, portable content.
   if(contents.research){
    const pins=await db.projectThemes.where('projectId').equals(p.id).toArray();
    for(const pin of pins){
     await db.projectThemes.update(pin.id,{
      themeId:researchMap[pin.themeId]||pin.themeId,
      revisionId:researchMap[pin.revisionId]||pin.revisionId
     });
    }
   }
   result.push({id:p.id,title:p.title});
  }
  return result;
 });
 return restored;
}
