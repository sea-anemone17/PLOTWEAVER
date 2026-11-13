import {useState} from 'react';
import {BookOpen,BrainCircuit,Download,Home,Lightbulb,Upload} from 'lucide-react';
import {downloadBlob} from './data';
import {makeResearchBackup,importResearchBackup} from './researchData';
import {Button} from './UI';
import GlobalIdeaGarden from './GlobalIdeaGarden';
import GlobalKnowledge from './GlobalKnowledge';
import GlobalThemes from './GlobalThemes';

export type GlobalSection='ideas'|'knowledge'|'themes';
type Props={section:GlobalSection;onSelect:(page:GlobalSection)=>void;onLibrary:()=>void};
export default function GlobalWorkspace({section,onSelect,onLibrary}:Props){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function backup(){
  setBusy(true);setError('');
  try{
   const data=await makeResearchBackup();
   downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'PLOTWEAVER-연구보관함.plotweaver-research.json');
  }catch(e){setError('연구 보관함 백업 실패: '+String(e));}finally{setBusy(false);}
 }
 async function importFile(file?:File){
  if(!file)return;
  setBusy(true);setError('');
  try{
   const count=await importResearchBackup(await file.text());
   alert(`자료를 기존 보관함을 덮어쓰지 않고 추가했습니다. 아이디어 ${count.ideas}개, 지식 ${count.knowledge}개, 주제의식 ${count.themes}개.`);
  }catch(e){setError('연구 보관함 복원 실패: '+String(e));}finally{setBusy(false);}
 }
 return <div className="global-app-shell">
  <header className="global-topbar">
   <button className="back-link" onClick={onLibrary}><Home size={17}/> 프로젝트 라이브러리</button>
   <strong>✳ PLOTWEAVER <small>전역 연구 공간</small></strong>
   <div className="research-actions">
    <Button variant="soft" disabled={busy} onClick={()=>void backup()}><Download size={15}/> 연구 자료 백업</Button>
    <label className="button soft upload-button"><Upload size={15}/> 연구 자료 복원<input hidden type="file" accept=".json,application/json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
   </div>
  </header>
  <div className="global-shell">
   <nav className="global-navigation" aria-label="전역 연구 공간">
    <button className={section==='ideas'?'active':''} onClick={()=>onSelect('ideas')}><Lightbulb size={17}/> 아이디어 정원</button>
    <button className={section==='knowledge'?'active':''} onClick={()=>onSelect('knowledge')}><BookOpen size={17}/> 지식 보관함</button>
    <button className={section==='themes'?'active':''} onClick={()=>onSelect('themes')}><BrainCircuit size={17}/> 주제의식 보관함</button>
   </nav>
   <main className="global-content">{error&&<p role="alert" className="graph-error">{error}</p>}
    {section==='ideas'&&<GlobalIdeaGarden/>}
    {section==='knowledge'&&<GlobalKnowledge/>}
    {section==='themes'&&<GlobalThemes/>}
   </main>
  </div>
 </div>;
}
