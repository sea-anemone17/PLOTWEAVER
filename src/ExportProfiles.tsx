import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {Download,FilePlus,Trash2} from 'lucide-react';
import {db,now,type ExportProfile} from './data';
import {profilePreset,addExportProfile,updateExportProfile,FONT_OPTIONS,type ExportPreset} from './exportProfiles';
import {exportDocx} from './Editor';
import {guardedProjectWrite} from './projectLease';
import {Button,Header} from './UI';

type Props={projectId:string;title:string};
export default function ExportProfiles({projectId,title}:Props){
 const profiles=useLiveQuery(()=>db.exportProfiles.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const [selectedId,setSelectedId]=useState('');
 const [preset,setPreset]=useState<ExportPreset>('gm');
 const [draft,setDraft]=useState<ExportProfile|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const current=profiles.find(p=>p.id===selectedId)||profiles[0];
 const config=draft&&draft.id===current?.id?draft:current;
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).filter(s=>!s.deletedAt).toArray(),[projectId],[]);
 const texts=useLiveQuery(()=>db.handouts.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const legacy=useLiveQuery(()=>db.manuscripts.get(projectId),[projectId]);
 const change=<K extends keyof ExportProfile>(key:K,value:ExportProfile[K])=>{if(config)setDraft({...config,[key]:value});};
 async function create(){
  setError('');
  try{const item=await addExportProfile(projectId,preset);setSelectedId(item.id);setDraft(null);}
  catch(e){setError(String(e));}
 }
 async function save(){
  if(!config)return;
  setBusy(true);setError('');
  try{await updateExportProfile(config);setDraft(null);}
  catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function generate(){
  if(!config)return;
  setBusy(true);setError('');
  try{
   await updateExportProfile(config);
   setDraft(null);
   if(config.includePrivate&&/배포|플레이어/.test(config.name)&&!confirm('이 프로필에는 GM 비공개 정보가 포함됩니다. 배포용 문서로 출력하시겠습니까?'))return;
   await exportDocx(projectId,title,config);
  }catch(e){setError('DOCX 출력 실패: '+String(e));}finally{setBusy(false);}
 }
 async function remove(){
  if(!current||!confirm('이 출력 프로필을 삭제하시겠습니까? 원고는 삭제되지 않습니다.'))return;
  try{await guardedProjectWrite(projectId,[db.exportProfiles],async()=>{await db.exportProfiles.delete(current.id);});setSelectedId('');setDraft(null);}catch(e){setError(String(e));}
 }
 const includedHandouts=texts.filter(t=>t.visibility==='player'||(config?.includePrivate&&t.visibility==='gm'));
 const charCount=legacy?.content?.content?.length||0;
 return <section className="export-profiles">
  <Header eyebrow="EXPORT PROFILES" title="원고 출력 프로필" description="같은 원고에서 GM 진행용·플레이어 배포용·검토용 DOCX의 포함 범위와 기본 서식을 나누어 관리합니다."/>
  {error&&<p className="graph-error" role="alert">{error}</p>}
  <div className="research-actions">
   <select aria-label="새 출력 프로필 프리셋" value={preset} onChange={e=>setPreset(e.target.value as ExportPreset)}>
    <option value="gm">GM 진행용</option><option value="player">배포용</option><option value="review">검토용</option>
   </select>
   <Button onClick={()=>void create()}><FilePlus size={15}/> 프리셋으로 프로필 생성</Button>
  </div>
  {profiles.length===0?<div className="export-empty">출력 프로필이 없습니다. 프리셋을 선택한 뒤 만들어 보세요.</div>:
  <div className="export-profile-grid">
   <aside className="research-list"><div className="research-list-items">{profiles.map(p=><button key={p.id} type="button" className={current?.id===p.id?'selected':''} onClick={()=>{setSelectedId(p.id);setDraft(null);}}>
    <small>{p.includePrivate?'GM 자료 포함':'GM 정보 제외'}</small><strong>{p.name}</strong>
   </button>)}</div></aside>
   {config&&<article className="export-profile-editor">
    <div className="research-fields export-profile-options">
     <label>프로필 이름<input value={config.name} onChange={e=>change('name',e.target.value)}/></label>
     <label>글꼴<select value={config.fontFamily} onChange={e=>change('fontFamily',e.target.value)}>
      {FONT_OPTIONS.map(font=><option key={font} value={font}>{font}</option>)}
     </select></label>
     <label>본문 크기 (pt)<input type="number" min="8" max="22" value={config.fontSize} onChange={e=>change('fontSize',Number(e.target.value))}/></label>
     <label>페이지 여백<select value={config.pageMargin} onChange={e=>change('pageMargin',Number(e.target.value))}>
      <option value={720}>좁게 · 0.5인치</option><option value={1080}>보통 · 0.75인치</option><option value={1440}>기본 · 1인치</option><option value={2160}>넓게 · 1.5인치</option>
     </select></label>
    </div>
    <div className="export-flags">
     {([
      {key:'includeLegacy',label:'기존 연속 원고 포함'},
      {key:'includeScenes',label:'장면별 원고 포함'},
      {key:'includeHandouts',label:'공개 범위에 맞는 핸드아웃 포함'},
      {key:'includePrivate',label:'GM 전용 블록·핸드아웃 포함'},
      {key:'includeGMResources',label:'GM 자료실 항목 추가 (GM 출력인 경우)'}
     ] as const).map(opt=><label className="checkbox-line" key={opt.key}><input type="checkbox" checked={config[opt.key]} onChange={e=>change(opt.key,e.target.checked)}/>{opt.label}</label>)}
    </div>
    {config.includeScenes&&<details className="export-scene-selection">
     <summary>장면별 출력 범위 설정 · {config.sceneIds===undefined?'전체 장면':'선택한 장면만'}</summary>
     <p className="muted small">선택하지 않으면 모든 장면을 출력합니다. 장면 목록의 순서가 DOCX 출력 순서입니다.</p>
     <Button variant="soft" onClick={()=>change('sceneIds',undefined)}>전체 장면 포함</Button>
     {scenes.map(scene=><label className="checkbox-line" key={scene.id}>
      <input type="checkbox" checked={config.sceneIds===undefined||config.sceneIds.includes(scene.id)} onChange={ev=>{
       const chosen=new Set(config.sceneIds===undefined?scenes.map(s=>s.id):config.sceneIds);
       if(ev.target.checked)chosen.add(scene.id);else chosen.delete(scene.id);
       change('sceneIds',[...chosen]);
      }}/>{scene.title}
     </label>)}
    </details>}
    <div className="export-preview">
     <strong>출력 범위 미리보기</strong>
     <p>기존 원고: {config.includeLegacy?(charCount?'포함':'내용 확인 필요'):'제외'}</p>
     <p>장면: {config.includeScenes?(config.sceneIds===undefined?scenes.length:config.sceneIds.length)+'개 중 작성된 원고':'제외'}</p>
     <p>핸드아웃: {config.includeHandouts?includedHandouts.length+'개 포함 대상':'제외'}</p>
     <p>GM 정보: {config.includePrivate?'포함 가능':'제외'}</p>
     <p className="muted small">이 미리보기는 포함 범위 요약이며 실제 페이지 배치 미리보기는 아닙니다. 이미지·PDF 핸드아웃 원본은 ZIP 백업 또는 별도 파일로 전달해야 합니다.</p>
    </div>
    <div className="research-actions">
     <Button disabled={busy} onClick={()=>void generate()}><Download size={15}/> 이 프로필로 DOCX 내보내기</Button>
     <Button variant="soft" disabled={busy} onClick={()=>void save()}>프로필 저장</Button>
     <Button variant="danger" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/> 프로필 삭제</Button>
    </div>
   </article>}
  </div>}
 </section>;
}
