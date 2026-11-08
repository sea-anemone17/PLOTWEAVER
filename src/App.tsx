import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArrowLeft, ArrowRight, BookOpenText, ChevronLeft, CircleHelp, Download, FilePenLine, FolderOpen, Home, Layers3, LayoutDashboard, Lightbulb, Menu, Network, Plus, Settings2, Sparkles, Upload, X } from 'lucide-react';
import Workspace, { type Section } from './Workspace';
import { db, createProject, restoreBackup, duplicateProject, deleteProject, downloadBackup, restoreDeletedProject, DIFFICULTIES, type Project } from './data';
import { Button, Pill } from './UI';

const nav:{key:Section;title:string;icon:typeof Home;hint:string}[]=[
 {key:'dashboard',title:'대시보드',icon:LayoutDashboard,hint:'현재 작업과 추천'},
 {key:'ideas',title:'아이디어 보관함',icon:Lightbulb,hint:'생각 모으기'},
 {key:'workshop',title:'서사 워크숍',icon:Sparkles,hint:'질문으로 설계하기'},
 {key:'plot',title:'플롯 보드',icon:Network,hint:'사건과 장면'},
 {key:'questions',title:'의문 해결실',icon:CircleHelp,hint:'가설과 검토'},
 {key:'archive',title:'진상·설정 자료실',icon:Archive,hint:'세계관과 단서'},
 {key:'manuscript',title:'원고 편집기',icon:FilePenLine,hint:'본문 집필'},
 {key:'settings',title:'프로젝트 설정',icon:Settings2,hint:'백업과 내보내기'}
];
const stages=['아직 소재가 없음','소재나 설정이 있음','임시 플롯이 있음','원고 작성 중','기존 작품을 수정 중'];
function Logo(){return <span className="brand"><span className="brand-symbol">✳</span><span>PLOTWEAVER<small>STORY DESIGN STUDIO</small></span></span>;}
function Wizard({onCreate,onCancel}:{onCreate:(p:Project)=>void;onCancel:()=>void}){
 const [step,setStep]=useState(0);
 const [busy,setBusy]=useState(false);
 const [form,setForm]=useState({title:'',kind:'TRPG 시나리오',stage:'소재나 설정이 있음',difficulty:'소재를 이야기로 연결하기 어려움',mode:'혼합형',idea:''});
 const change=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
 const titles=['어떤 이야기를 쓰시나요?','지금 어느 단계에 있나요?','지금 떠오르는 생각이 있나요?','어떤 부분이 가장 어렵나요?','어떻게 작업하고 싶나요?','이제 시작할 준비가 됐습니다'];
 async function finish(){
  setBusy(true);try{const p=await createProject(form,form.idea);onCreate(p);}catch(e){alert('프로젝트를 만들지 못했습니다: '+String(e));}finally{setBusy(false);}
 }
 return <div className="wizard-wrap"><div className="wizard-top"><button className="back-link" onClick={onCancel}><ArrowLeft size={17}/> 프로젝트 목록</button><span>NEW PROJECT · {Math.min(step+1,6)} / 6</span></div><div className="wizard-progress">{titles.map((_,i)=><span key={i} className={i<=step?'done':''}/>)}</div>
  <div className="wizard-card"><div className="eyebrow">A NEW STORY BEGINS</div><h1>{titles[step]}</h1><p className="wizard-subtitle">답변은 언제든 수정할 수 있습니다. 건너뛰어도 프로젝트를 만들 수 있습니다.</p>
   {step===0&&<div className="wizard-fields"><label className="field"><span>프로젝트 제목</span><input autoFocus value={form.title} onChange={e=>change('title',e.target.value)} placeholder="제목 미정이어도 괜찮습니다"/></label><label className="field"><span>작품 유형</span><div className="choice-grid">{['TRPG 시나리오','소설','기타'].map(x=><button key={x} className={'choice'+(form.kind===x?' chosen':'')} onClick={()=>change('kind',x)}>{x}</button>)}</div></label></div>}
   {step===1&&<div className="choice-stack">{stages.map(x=><button key={x} className={'choice'+(form.stage===x?' chosen':'')} onClick={()=>change('stage',x)}>{x}<span>{form.stage===x?'✓':'↗'}</span></button>)}</div>}
   {step===2&&<textarea className="wizard-textarea" rows={12} value={form.idea} onChange={e=>change('idea',e.target.value)} placeholder={'분위기, 인물, 대사, 진상, 장면…\n완성되지 않은 생각을 그대로 적어 보세요.\n내용은 첫 아이디어로 보존됩니다.'}/>}
   {step===3&&<div className="choice-stack">{DIFFICULTIES.map(x=><button key={x} className={'choice'+(form.difficulty===x?' chosen':'')} onClick={()=>change('difficulty',x)}>{x}<span>{form.difficulty===x?'✓':'↗'}</span></button>)}</div>}
   {step===4&&<div className="choice-stack">{[{name:'안내형',description:'질문을 하나씩 따라가며 서사를 설계합니다.'},{name:'자유형',description:'원하는 작업 공간에서 자유롭게 시작합니다.'},{name:'혼합형',description:'자유롭게 작업하면서 다음 질문을 추천받습니다.'}].map(x=><button key={x.name} className={'choice choice-long'+(form.mode===x.name?' chosen':'')} onClick={()=>change('mode',x.name)}><strong>{x.name}</strong><small>{x.description}</small></button>)}</div>}
   {step===5&&<div className="wizard-summary"><div><span>프로젝트</span><strong>{form.title||'제목 미정'}</strong></div><div><span>유형</span><strong>{form.kind}</strong></div><div><span>현재 상태</span><strong>{form.stage}</strong></div><div><span>작업 방식</span><strong>{form.mode}</strong></div><p>원하는 화면부터 시작할 수 있습니다. 서사 워크숍과 원고 편집기는 언제나 이용 가능합니다.</p></div>}
   <div className="wizard-actions"><Button variant="ghost" onClick={()=>step===0?onCancel():setStep(s=>s-1)}><ChevronLeft size={16}/> 이전</Button><span className="grow"/>{step<5?<Button onClick={()=>setStep(s=>s+1)}>계속하기 <ArrowRight size={16}/></Button>:<Button disabled={busy} onClick={()=>void finish()}>{busy?'생성 중…':'프로젝트 만들기'} <Sparkles size={16}/></Button>}</div>
  </div><div className="wizard-footnote">✧ 작은 아이디어에서 시작해도, 이미 원고가 있어도 좋습니다.</div>
 </div>;
}
export default function App(){
 const projects=useLiveQuery(()=>db.projects.orderBy('updatedAt').reverse().toArray(),[],[]);
 const trashed=useLiveQuery(()=>db.trash.orderBy('deletedAt').reverse().toArray(),[],[]);
 const [projectId,setProjectId]=useState(()=>localStorage.getItem('plotweaver.active')||'');
 const [section,setSection]=useState<Section>('dashboard');
 const [wizard,setWizard]=useState(false);
 const [drawer,setDrawer]=useState(false);
 const [importing,setImporting]=useState(false);
 const project=projects.find(p=>p.id===projectId);
 function openProject(id:string){localStorage.setItem('plotweaver.active',id);setProjectId(id);setSection('dashboard');setWizard(false);setDrawer(false);}
 function goHome(){localStorage.removeItem('plotweaver.active');setProjectId('');setSection('dashboard');setWizard(false);setDrawer(false);}
 async function importFile(file?:File){
  if(!file)return;setImporting(true);
  try{const raw=await file.text();const p=await restoreBackup(raw);openProject(p.id);}
  catch(e){alert('백업을 복원할 수 없습니다: '+String(e));}
  finally{setImporting(false);}
 }
 if(!project)return <div className="landing">
  <header className="landing-header"><Logo/><span className="local-label"><span className="status-dot"/> LOCAL-FIRST WRITING</span></header>
  {wizard?<Wizard onCreate={p=>openProject(p.id)} onCancel={()=>setWizard(false)}/>:<main className="landing-main">
   <div className="landing-eyebrow">✦ YOUR CREATIVE WORKSPACE</div><h1>모든 이야기는<br/><em>한 줄의 생각</em>에서 시작됩니다.</h1>
   <p className="landing-sub">소재를 수집하고, 인과를 발견하고, 플레이 가능한 장면으로 엮어 보세요.<br/>PLOTWEAVER는 작가 대신 결정하지 않습니다.</p>
   <div className="landing-actions"><Button onClick={()=>setWizard(true)}><Plus size={18}/> 새 프로젝트 만들기</Button><label className="button soft upload-button"><Upload size={17}/>{importing?'복원 중…':'백업 파일 복원'}<input type="file" hidden accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label></div>
   <section className="projects-section"><div className="section-caption"><h2>내 프로젝트</h2><span>{projects.length}개 · 이 기기에 저장됨</span></div>
    {projects.length?<div className="project-grid">{projects.map(p=><article className="project-card" key={p.id}>
     <div className="project-deco">✳</div><Pill>{p.kind}</Pill><h3>{p.title}</h3><p>{p.stage}</p><div className="project-bottom"><small>{new Date(p.updatedAt).toLocaleDateString('ko-KR')} 수정</small><button className="open-project" onClick={()=>openProject(p.id)}>열기 <ArrowRight size={17}/></button></div>
     <div className="project-tools"><button onClick={()=>void downloadBackup(p.id)} title="JSON 백업"><Download size={16}/></button><button title="프로젝트 복제" onClick={()=>void duplicateProject(p.id).then(copy=>openProject(copy.id))}><Layers3 size={16}/></button><button title="삭제" onClick={()=>{if(confirm('프로젝트를 휴지통으로 이동하시겠습니까? 나중에 복원할 수 있습니다.'))void deleteProject(p.id).catch(e=>alert('삭제 실패: '+String(e)));}}><X size={16}/></button></div>
    </article>)}</div>:<div className="empty-home"><div className="empty-home-icon"><BookOpenText size={36}/></div><h3>아직 프로젝트가 없습니다</h3><p>머릿속의 이야기를 이곳에서 시작해 보세요.</p><Button onClick={()=>setWizard(true)}>첫 프로젝트 시작하기 <ArrowRight size={16}/></Button></div>}
   </section>
   {trashed.length>0&&<section className="projects-section" aria-label="휴지통"><div className="section-caption"><h2>휴지통</h2><span>{trashed.length}개 · 이 기기에 저장됨</span></div>
    <div className="project-grid">{trashed.map(t=><article className="project-card" key={t.id}><Pill>삭제된 프로젝트</Pill><h3>{t.backup.project.title}</h3><p>{new Date(t.deletedAt).toLocaleString('ko-KR')} 이동</p><Button variant="soft" onClick={()=>void restoreDeletedProject(t.id).then(p=>openProject(p.id)).catch(e=>alert('복원 실패: '+String(e)))}>프로젝트 복원</Button></article>)}</div>
   </section>}
   <p className="privacy-caption">🔒 작업 내용은 별도 서버로 전송되지 않고, 이 브라우저에 저장됩니다. 중요한 원고는 JSON으로 정기 백업하세요.</p>
  </main>}
 </div>;
 return <div className="app-shell">
  <aside className={'sidebar'+(drawer?' open':'')}>
   <div className="sidebar-top"><button className="logo-button" onClick={goHome}><Logo/></button><button className="sidebar-close" onClick={()=>setDrawer(false)} aria-label="메뉴 닫기"><X size={20}/></button></div>
   <button className="current-project" onClick={goHome}><FolderOpen size={19}/><span><small>현재 프로젝트</small><strong>{project.title}</strong></span><ChevronLeft size={16}/></button>
   <div className="sidebar-group">WORKSPACE</div>
   <nav className="sidebar-nav">{nav.map(item=>{const Icon=item.icon;return <button key={item.key} className={'nav-item'+(section===item.key?' active':'')} onClick={()=>{setSection(item.key);setDrawer(false);}}><Icon size={19}/><span>{item.title}</span>{section===item.key&&<span className="nav-active-marker"/>}</button>;})}</nav>
   <div className="sidebar-bottom"><div className="storage-note"><span className="status-dot"/> 로컬 우선 · 원고 저장 상태는 편집기에서 확인</div><button className="back-link" onClick={goHome}><ArrowLeft size={16}/> 전체 프로젝트</button><div className="sidebar-version">PLOTWEAVER <span>v0.1</span></div></div>
  </aside>
  {drawer&&<div className="mobile-scrim" onClick={()=>setDrawer(false)}/>}
  <div className="app-main"><header className="topbar"><button className="mobile-menu" onClick={()=>setDrawer(true)} aria-label="메뉴 열기"><Menu size={23}/></button><div className="breadcrumbs"><button onClick={goHome}>프로젝트</button><span>/</span><strong>{nav.find(x=>x.key===section)?.title}</strong></div><div className="topbar-actions"><span className="save-state"><span className="status-dot"/> 이 기기의 작업 공간</span><button className="icon-button" title="원고 편집기로 이동" onClick={()=>setSection('manuscript')}><BookOpenText size={19}/></button><button className="icon-button" title="설정" onClick={()=>setSection('settings')}><Settings2 size={19}/></button></div></header>
  <Workspace key={project.id} project={project} section={section} setSection={setSection} goHome={goHome} openProject={openProject}/>
  </div>
 </div>;
}
