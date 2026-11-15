import { flushProjectEdits } from './saveBarrier';
import JSZip from 'jszip';
import { documentText, handoutDocument, handoutTemplates } from './writingTemplates';
import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {Download,FilePlus,Paperclip,Trash2} from 'lucide-react';
import {db,downloadBlob,emptyDocument,fresh,now,touch,type Visibility} from './data';
import {Button,Empty,Header,Pill} from './UI';
import GlobalRichEditor from './GlobalRichEditor';
import {guardedProjectWrite} from './projectLease';

const ACCEPT=['application/pdf','image/png','image/jpeg','image/webp'];
const MAX_FILE=20*1024*1024;
const VISIBILITIES:{value:Visibility;label:string}[]=[
 {value:'draft',label:'공개 미정 · 배포 제외'},
 {value:'gm',label:'GM 전용'},
 {value:'player',label:'플레이어 공개 가능'}
];
type Props={projectId:string};
export default function HandoutLibrary({projectId}:Props){
 const handouts=useLiveQuery(()=>db.handouts.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const assets=useLiveQuery(()=>db.assets.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).filter(scene=>!scene.deletedAt).toArray(),[projectId],[]);
 const clues=useLiveQuery(()=>db.clues.where('projectId').equals(projectId).filter(item=>!item.deletedAt).toArray(),[projectId],[]);
 const [template,setTemplate]=useState('빈 문서');
 const [selectedId,setSelectedId]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const selected=handouts.find(x=>x.id===selectedId)||handouts[0];
 const chosen=selected?.assetId?assets.find(a=>a.id===selected.assetId):undefined;
 const attempt=(p:Promise<unknown>)=>{void p.then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e)));};
 async function createText(){
  const item={...fresh(projectId),title:template==='빈 문서'?'새 텍스트 핸드아웃':template,kind:'text' as const,visibility:'draft' as const,content:handoutDocument(template),assetId:null};
  await guardedProjectWrite(projectId,[db.handouts],async()=>{await db.handouts.add(item);await touch(projectId);});
  setSelectedId(item.id);
 }
 async function upload(file?:File){
  if(!file)return;
  if(!ACCEPT.includes(file.type)||file.size>MAX_FILE){setError('PDF·PNG·JPG·WebP 파일만 지원하며 파일당 20MB 이하만 저장할 수 있습니다.');return;}
  setBusy(true);setError('');
  try{
   await guardedProjectWrite(projectId,[db.handouts,db.assets],async()=>{
    if(!await db.projects.get(projectId))throw Error('프로젝트를 찾을 수 없습니다.');
    const asset={...fresh(projectId),name:file.name,mime:file.type,size:file.size,blob:file};
    const record={...fresh(projectId),title:file.name,kind:'file' as const,visibility:'draft' as const,assetId:asset.id,content:emptyDocument};
    await db.assets.add(asset);await db.handouts.add(record);
    await db.projects.update(projectId,{updatedAt:now()});
    setSelectedId(record.id);
   });
  }catch(e){setError('첨부파일 저장 실패: '+String(e));}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  const item=await db.handouts.get(id);
  if(!item)return;
  if(!confirm('이 핸드아웃을 삭제하시겠습니까? 파일 원본도 프로젝트에서 삭제됩니다. 삭제하기 전 ZIP 백업을 권장합니다.'))return;
  await guardedProjectWrite(projectId,[db.handouts,db.assets],async()=>{
   await db.handouts.delete(id);
   if(item.assetId){
    const shared=await db.handouts.where('assetId').equals(item.assetId).count();
    if(!shared)await db.assets.delete(item.assetId);
   }
   await db.projects.update(projectId,{updatedAt:now()});
  });
  if(selectedId===id)setSelectedId('');
 }
 async function downloadPlayerPack(){
  await flushProjectEdits(projectId);
  const { publicItems, projectAssets } = await db.transaction('r',[db.handouts,db.assets],async()=>({
   publicItems:await db.handouts.where('projectId').equals(projectId).filter(item=>item.visibility==='player').toArray(),
   projectAssets:await db.assets.where('projectId').equals(projectId).toArray()
  }));
  if(!publicItems.length)throw Error('플레이어 공개로 표시한 핸드아웃이 없습니다.');
  const archive=new JSZip();
  for(const [index,item] of publicItems.entries()){
   const name=String(index+1).padStart(2,'0')+'-'+item.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100);
   if(item.kind==='text')archive.file(name+'.txt',documentText(item.content));
   else{
    const asset=projectAssets.find(asset=>asset.id===item.assetId);
    if(!asset)throw Error(item.title+'의 파일 원본이 없습니다.');
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/pdf':'pdf'} as Record<string,string>)[asset.mime];
    if(!extension)throw Error(item.title+'의 파일 형식을 확인해 주세요.');
    archive.file(name+'.'+extension,await asset.blob.arrayBuffer());
   }
  }
  downloadBlob(await archive.generateAsync({type:'blob',compression:'DEFLATE'}),'PLOTWEAVER-플레이어-핸드아웃.zip');
 }
 function downloadFile(){
  if(!chosen){setError('첨부파일을 찾을 수 없습니다. 백업에서 복구해 주세요.');return;}
  downloadBlob(chosen.blob,chosen.name);
 }
 return <div className="handout-library">
  <Header eyebrow="HANDOUT LIBRARY" title="핸드아웃" description="외부 파일을 등록하거나 문서형 텍스트 핸드아웃을 작성합니다. 공개 범위는 원고 출력과 별도로 관리합니다."/>
  {error&&<p className="graph-error" role="alert">{error}</p>}
  <div className="research-actions handout-actions">
   <label>템플릿 <select value={template} onChange={e=>setTemplate(e.target.value)}>{Object.keys(handoutTemplates).map(name=><option key={name}>{name}</option>)}</select></label>
   <Button onClick={()=>attempt(createText())}><FilePlus size={15}/> 텍스트 핸드아웃</Button>
   <Button variant="soft" disabled={busy||!handouts.some(item=>item.visibility==='player')} onClick={()=>{
    setBusy(true);
    attempt(downloadPlayerPack().finally(()=>setBusy(false)));
   }}>공개용 ZIP</Button>
   <label className="button soft upload-button"><Paperclip size={15}/>{busy?'파일 저장 중…':'파일 등록'}<input disabled={busy} type="file" hidden accept=".pdf,image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
  </div>
  {!handouts.length?<Empty title="플레이어에게 전달할 자료를 준비해 보세요" description="편지·일지 같은 텍스트를 작성하거나 이미지·PDF를 등록할 수 있습니다." action={()=>attempt(createText())}/>:
  <div className="research-master-detail">
   <aside className="research-list"><div className="research-list-items">
    {handouts.map(h=><button type="button" key={h.id} className={selected?.id===h.id?'selected':''} onClick={()=>setSelectedId(h.id)}>
     <small>{h.kind==='text'?'텍스트 핸드아웃':'파일 핸드아웃'} · {VISIBILITIES.find(v=>v.value===h.visibility)?.label}</small>
     <strong>{h.title}</strong>
    </button>)}
   </div></aside>
   {selected&&<article className="research-document">
    <div className="research-fields handout-heading">
     <label>핸드아웃 이름<input key={selected.id+'title'} defaultValue={selected.title} onBlur={e=>attempt(guardedProjectWrite(projectId,[db.handouts],async()=>{
      await db.handouts.update(selected.id,{title:e.target.value.trim()||'제목 없음',updatedAt:now()});await touch(projectId);
     }))}/></label>
     <label>공개 범위<select value={selected.visibility} onChange={e=>attempt(guardedProjectWrite(projectId,[db.handouts],async()=>{
      await db.handouts.update(selected.id,{visibility:e.target.value as Visibility,updatedAt:now()});await touch(projectId);
     }))}>
      {VISIBILITIES.map(v=><option value={v.value} key={v.value}>{v.label}</option>)}
     </select></label>
     {([['sceneId','공개 장면',scenes],['clueId','공개에 필요한 단서',clues]] as const).map(([key,label,items])=>
      <label key={key}>{label}<select value={selected[key]||''} onChange={e=>{
       const value=e.target.value;
       attempt(guardedProjectWrite(projectId,[db.handouts],async()=>{
        await db.handouts.update(selected.id,{[key]:value,updatedAt:now()});await touch(projectId);
       }));
      }}><option value="">지정하지 않음</option>
      {!!selected[key]&&!items.some(item=>item.id===selected[key])&&<option disabled value={selected[key]}>사용할 수 없는 연결</option>}
      {items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>)}
    </div>
    {selected.kind==='text'?<>
     <Pill>편집 가능한 텍스트</Pill>
     <GlobalRichEditor key={selected.id} documentId={selected.id} saveScope={projectId} content={selected.content} onSave={content=>guardedProjectWrite(projectId,[db.handouts],async()=>{
      await db.handouts.update(selected.id,{content,updatedAt:now()});
      await touch(projectId);
     })}/>
    </>:<>
     <Pill>{chosen?.mime||'파일 정보 없음'}</Pill>
     <p>원본 파일: {chosen?.name||'누락됨'} · {chosen?Math.round(chosen.size/1024).toLocaleString('ko-KR')+'KB':'첨부파일을 찾을 수 없음'}</p>
     <div className="research-actions"><Button disabled={!chosen} variant="soft" onClick={downloadFile}><Download size={15}/> 원본 파일 내려받기</Button></div>
     <p className="muted small">등록된 파일은 이 브라우저의 IndexedDB에 보관되며, ZIP 백업에 포함됩니다. JSON 백업만으로는 파일 원본을 복원할 수 없습니다.</p>
    </>}
    <Button variant="danger" onClick={()=>attempt(remove(selected.id))}><Trash2 size={15}/> 핸드아웃 삭제</Button>
   </article>}
  </div>}
 </div>;
}
