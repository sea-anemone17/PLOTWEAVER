import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Download, FileText, Lightbulb, Plus, Save, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { db, fresh, now, touch, STAGES, IDEA_CATEGORIES, IDEA_STATUSES, LORE_KINDS, downloadBackup, duplicateProject, deleteProject, recommend, type Project, type Idea, type Scene, type Question, type Hypothesis } from './data';
import { PROMPTS } from './prompts';
import { Button, Card, Empty, Header, ModalEditor, Pill, type Field } from './UI';
import ManuscriptEditor, { exportDocx } from './Editor';

type Section='dashboard'|'ideas'|'workshop'|'plot'|'questions'|'archive'|'manuscript'|'settings';
type Editable='ideas'|'events'|'scenes'|'questions'|'hypotheses'|'lore'|'clues';
type Dialog={table:Editable;title:string;fields:Field[];initial?:Record<string,unknown>;defaults?:Record<string,unknown>};
type Props={project:Project;section:Section;setSection:(s:Section)=>void;goHome:()=>void;openProject:(id:string)=>void};
const option=(values:string[])=>values.map(value=>({value,label:value}));
const field=(key:string,label:string,kind:Field['kind']='text',options?:Field['options']):Field=>({key,label,kind,options});
const fmt=(n:number)=>new Date(n).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'});
export default function Workspace({project,section,setSection,goHome,openProject}:Props){
 const id=project.id;
 const ideas=useLiveQuery(()=>db.ideas.where('projectId').equals(id).toArray(),[id],[]);
 const events=useLiveQuery(()=>db.events.where('projectId').equals(id).toArray(),[id],[]);
 const scenes=useLiveQuery(()=>db.scenes.where('projectId').equals(id).toArray(),[id],[]);
 const questions=useLiveQuery(()=>db.questions.where('projectId').equals(id).toArray(),[id],[]);
 const hypotheses=useLiveQuery(()=>db.hypotheses.where('projectId').equals(id).toArray(),[id],[]);
 const lore=useLiveQuery(()=>db.lore.where('projectId').equals(id).toArray(),[id],[]);
 const clues=useLiveQuery(()=>db.clues.where('projectId').equals(id).toArray(),[id],[]);
 const answers=useLiveQuery(()=>db.answers.where('projectId').equals(id).toArray(),[id],[]);
 const relations=useLiveQuery(()=>db.relations.where('projectId').equals(id).toArray(),[id],[]);
 const [dialog,setDialog]=useState<Dialog|null>(null);
 const [search,setSearch]=useState('');
 const [ideaStatus,setIdeaStatus]=useState('전체');
 const [plotType,setPlotType]=useState<'scenes'|'events'>('scenes');
 const [plotView,setPlotView]=useState<'board'|'timeline'>('board');
 const [archiveType,setArchiveType]=useState<'lore'|'clues'>('lore');
 const [selectedQuestion,setSelectedQuestion]=useState<string|null>(null);
 const [questionIndex,setQuestionIndex]=useState(0);
 const prompts=useMemo(()=>PROMPTS.filter(q=>project.model==='미스터리 역설계형'||!q.group.startsWith('M')), [project.model]);
 const active=prompts[Math.min(questionIndex,prompts.length-1)];
 const found=answers.find(a=>a.promptId===active?.id);
 const [answerDraft,setAnswerDraft]=useState('');
 const [showHelp,setShowHelp]=useState(false);
 useEffect(()=>{setAnswerDraft(found?.body||'');setShowHelp(false);},[found?.id,found?.body,active?.id]);
 const fields={
  ideas:[field('title','아이디어 제목'),field('body','자유 메모','textarea'),field('category','분류','select',option(IDEA_CATEGORIES)),field('status','상태','select',option(IDEA_STATUSES)),field('tags','태그 (쉼표로 구분)')],
  events:[field('title','사건명'),field('body','발생한 일','textarea'),field('when','발생 시점 (정렬하려면 YYYY-MM-DD 권장)'),field('cause','원인','textarea'),field('result','결과','textarea')],
  scenes:[field('title','장면명'),field('stage','진행 단계','select',option(STAGES)),field('purpose','장면의 목적','textarea'),field('body','진행 내용','textarea'),field('entry','진입 조건'),field('information','발견 가능한 정보','textarea'),field('actions','가능한 PC 행동','textarea'),field('outcome','선택에 따른 결과','textarea'),field('eventId','연결할 실제 사건','select',events.map(e=>({value:e.id,label:e.title}))),field('nextIds','도달 가능한 후속 장면 (복수 선택)','multi',scenes.map(s=>({value:s.id,label:s.title})))],
  questions:[field('title','아직 설명되지 않은 질문'),field('context','발생 배경','textarea'),field('importance','중요도','select',option(['높음','보통','낮음'])),field('status','해결 상태','select',option(['미해결','검토 중','해결','보류']))],
  hypotheses:[field('body','가설 내용','textarea'),field('evidence','근거','textarea'),field('effect','서사적 효과','textarea'),field('conflict','다른 설정과의 충돌','textarea'),field('status','상태','select',option(['검토','채택','보류','폐기']))],
  lore:[field('title','자료명'),field('body','세부 내용','textarea'),field('kind','종류','select',option(LORE_KINDS)),field('private','GM 전용 정보','checkbox')],
  clues:[field('title','단서명'),field('body','단서 내용','textarea'),field('truth','이 단서가 가리키는 진상','textarea'),field('where','발견할 수 있는 장면·장소'),field('condition','발견 조건'),field('alternate','대체 획득 경로'),field('audience','공개 대상')]
 };
 function edit(table:Editable,initial?:Record<string,unknown>,defaults:Record<string,unknown>={}){
  const names:Record<Editable,string>={ideas:'아이디어',events:'사건',scenes:'장면',questions:'의문',hypotheses:'가설',lore:'진상·설정',clues:'단서'};
  setDialog({table,title:names[table]+(initial?' 편집':' 작성'),fields:fields[table],initial,defaults});
 }
 async function saveDialog(v:Record<string,any>){
  if(!dialog)return;
  const {table,initial,defaults}=dialog;
  const data={...fresh(id),...defaults,...initial,...v,updatedAt:now()};
  if(table==='scenes'){data.order=initial?.order??scenes.length;data.stage=data.stage||'발단';data.nextIds=(data.nextIds||[]).filter((x:string)=>x!==data.id);}
  if(table==='events')data.order=initial?.order??events.length;
  await db.table(table).put(data);
  if(table==='hypotheses'&&v.status==='채택'&&data.questionId)await db.questions.update(data.questionId,{status:'해결',updatedAt:now()});
  await touch(id);
 }
 async function deleteDialog(){if(dialog?.initial?.id){await db.table(dialog.table).delete(dialog.initial.id);await touch(id);}}
 async function promote(idea:Idea){
  const s={...fresh(id),title:idea.title||'아이디어 기반 장면',stage:'전개',purpose:'',body:idea.body,entry:'',information:'',actions:'',outcome:'',eventId:'',nextIds:[],order:scenes.length};
  await db.scenes.add(s);
  await db.relations.add({...fresh(id),sourceId:idea.id,targetId:s.id,type:'장면의 원본 아이디어'});
  await touch(id);setSection('plot');setPlotType('scenes');
 }
 async function storeAnswer(status:'답변'|'보류'|'해당 없음',advance=false){
  if(!active)return;
  await db.answers.put({...fresh(id),...found,promptId:active.id,body:answerDraft,status,updatedAt:now()});
  await touch(id);
  if(advance)setQuestionIndex(i=>Math.min(i+1,prompts.length-1));
 }
 const answeredCount=answers.filter(a=>a.status==='답변').length;
 const matchingIdeas=ideas.filter(i=>(ideaStatus==='전체'||i.status===ideaStatus)&&[i.title,i.body,i.tags].join(' ').toLowerCase().includes(search.toLowerCase()));
 const stages=STAGES;
 const allEntities=[...ideas.map(x=>({id:x.id,title:x.title})),...events.map(x=>({id:x.id,title:x.title})),...scenes.map(x=>({id:x.id,title:x.title}))];
 const jump=(s:Section)=>setSection(s);
 const basicCard=(title:string,text:string,action:()=>void)=><button className="action-tile" onClick={action}><h3>{title}</h3><p>{text}</p><ArrowRight size={17}/></button>;
 const totals=[['아이디어',ideas.length],['사건',events.length],['장면',scenes.length],['미해결 의문',questions.filter(q=>q.status!=='해결').length],['설계 답변',answeredCount]];
 const recommendation=recommend(project);
 async function swapScene(scene:Scene,direction:-1|1){
  const list=[...scenes].sort((a,b)=>a.order-b.order),idx=list.findIndex(s=>s.id===scene.id),other=list[idx+direction];
  if(!other)return;
  await db.transaction('rw',db.scenes,async()=>{await db.scenes.update(scene.id,{order:other.order});await db.scenes.update(other.id,{order:scene.order});});
  await touch(id);
 }
 async function chooseHypothesis(h:Hypothesis){
  const group=hypotheses.filter(x=>x.questionId===h.questionId);
  for(const item of group)await db.hypotheses.update(item.id,{status:item.id===h.id?'채택':'검토',updatedAt:now()});
  await db.questions.update(h.questionId,{status:'해결',updatedAt:now()});
  await touch(id);
 }
 return <div className="workspace-content">
  {section==='dashboard'&&<>
   <Header eyebrow="PROJECT OVERVIEW" title={'다시 오신 것을 환영합니다.'} description={project.title+' · 마지막 변경 '+fmt(project.updatedAt)}/>
   <div className="hero-panel"><div><div className="eyebrow light">SUGGESTED NEXT STEP</div><h2>{recommendation}</h2><p>지금 필요한 질문부터 시작해도 좋습니다. 순서를 강제하지 않습니다.</p><Button onClick={()=>jump(recommendation.includes('의문')?'questions':recommendation.includes('플롯')||recommendation.includes('장면')?'plot':recommendation.includes('원고')?'manuscript':'workshop')}>작업 이어가기 <ArrowRight size={16}/></Button></div><span className="hero-symbol">✳</span></div>
   <div className="stats-grid">{totals.map(([name,n])=><div className="stat" key={name}><strong>{n}</strong><span>{name}</span></div>)}</div>
   <div className="section-caption"><h2>어디서 시작할까요?</h2><span>자유롭게 이동할 수 있습니다</span></div>
   <div className="tile-grid">{basicCard('아이디어 모으기','떠오른 생각을 분류 없이 적어 두세요.',()=>jump('ideas'))}{basicCard('서사 질문 받기','작품의 뼈대를 만드는 질문을 따라갑니다.',()=>jump('workshop'))}{basicCard('장면 설계하기','플레이 순서와 사건 순서를 구분해 보세요.',()=>jump('plot'))}{basicCard('원고 바로 쓰기','구상 없이 본문부터 시작해도 됩니다.',()=>jump('manuscript'))}</div>
   <div className="note-panel"><label className="eyebrow" htmlFor="next-task">내가 정한 다음 작업</label><input id="next-task" key={id+'next'+project.nextTask} defaultValue={project.nextTask} placeholder="예: HO3 개인 장면의 갈등 쓰기" onBlur={async e=>{await db.projects.update(id,{nextTask:e.target.value,updatedAt:now()});}}/><span>입력 후 다른 곳을 누르면 자동 저장됩니다.</span></div>
  </>}
  {section==='ideas'&&<>
   <Header eyebrow="IDEA INBOX" title="아이디어 보관함" description="아직 완성되지 않은 생각도 그대로 남겨 두세요." action={()=>edit('ideas',undefined,{title:'',body:'',category:'소재',status:'미분류',tags:''})} actionText="+ 아이디어"/>
   <div className="filter-bar"><input className="search" placeholder="제목·본문·태그 검색" aria-label="아이디어 검색" value={search} onChange={e=>setSearch(e.target.value)}/><select value={ideaStatus} onChange={e=>setIdeaStatus(e.target.value)}><option>전체</option>{IDEA_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
   {matchingIdeas.length?<div className="card-grid">{[...matchingIdeas].sort((a,b)=>b.updatedAt-a.updatedAt).map(i=><Card key={i.id} title={i.title} body={i.body} meta={<><Pill>{i.category}</Pill><Pill tone={i.status==='채택'?'success':'neutral'}>{i.status}</Pill></>} onClick={()=>edit('ideas',i)} footer={<><span>{i.tags&&'#'+i.tags.split(',').map(x=>x.trim()).filter(Boolean).join(' #')}</span><button className="text-link" onClick={()=>void promote(i)}>장면으로 연결 <ChevronRight size={14}/></button></>}/>)}</div>:<Empty title="아직 적어 둔 아이디어가 없습니다" description="단어 하나, 대사 한 줄부터 시작해도 좋습니다." action={()=>edit('ideas',undefined,{category:'소재',status:'미분류'})}/>}
  </>}
  {section==='workshop'&&<>
   <Header eyebrow="NARRATIVE WORKSHOP" title="서사 설계 워크숍" description="질문에 답하면서 플롯을 스스로 만들어 갑니다. 정답이나 점수는 없습니다."/>
   <div className="workshop-layout"><aside className="prompt-list"><div className="eyebrow">QUESTION LIBRARY</div>{prompts.map((q,i)=><button key={q.id} className={'prompt-index'+(i===questionIndex?' selected':'')} onClick={()=>setQuestionIndex(i)}><span>{String(i+1).padStart(2,'0')}</span><span>{q.title}</span>{answers.some(a=>a.promptId===q.id&&a.status==='답변')&&<CheckCircle2 size={15}/>}</button>)}</aside>
   <div className="prompt-panel"><div className="prompt-progress"><span>{active.group}</span><span>{questionIndex+1} / {prompts.length}</span></div><div className="progress-bar"><div style={{width:(answeredCount/prompts.length*100)+'%'}}/></div><div className="prompt-main"><div className="large-sparkle">✳</div><h2>{active.title}</h2><p className="prompt-purpose"><Lightbulb size={17}/>{active.purpose}</p><button className="help-toggle" onClick={()=>setShowHelp(v=>!v)}>{showHelp?'보조 질문 접기':'생각을 돕는 질문 펼치기'} <ChevronRight size={15}/></button>{showHelp&&<div className="help-box">{active.help.map((h,i)=><p key={i}>· {h}</p>)}</div>}
   <textarea className="answer-area" rows={10} value={answerDraft} placeholder="떠오르는 생각을 자유롭게 적어 보세요. 완벽하지 않아도 괜찮습니다." onChange={e=>setAnswerDraft(e.target.value)}/>
   {found&&<p className="saved-inline">마지막 저장: {found.status} · {fmt(found.updatedAt)}</p>}
   <div className="workshop-actions"><Button variant="ghost" onClick={()=>setQuestionIndex(i=>Math.max(0,i-1))}>이전</Button><span className="grow"/><Button variant="soft" onClick={()=>void storeAnswer('보류',true)}>보류</Button><Button variant="soft" onClick={()=>void storeAnswer('해당 없음',true)}>해당 없음</Button><Button onClick={()=>void storeAnswer('답변',true)}><Save size={16}/> 저장하고 다음</Button></div>
   </div></div></div>
  </>}
  {section==='plot'&&<>
   <Header eyebrow="PLOT BOARD" title="플롯 보드" description="사건이 발생한 시간과 플레이어가 경험하는 순서를 별도로 관리합니다." action={()=>edit(plotType,undefined,plotType==='scenes'?{title:'',stage:'발단',nextIds:[]}:{title:''})} actionText={plotType==='scenes'?'+ 새 장면':'+ 새 사건'}/>
   <div className="tab-bar"><button className={plotType==='scenes'?'selected':''} onClick={()=>setPlotType('scenes')}>플레이 진행 · 장면 {scenes.length}</button><button className={plotType==='events'?'selected':''} onClick={()=>setPlotType('events')}>실제 사건 · 연대기 {events.length}</button><span className="grow"/><button className={plotView==='board'?'selected':''} onClick={()=>setPlotView('board')}>단계별</button><button className={plotView==='timeline'?'selected':''} onClick={()=>setPlotView('timeline')}>목록</button></div>
   {plotType==='scenes'?(scenes.length?<div className={plotView==='board'?'plot-board':'stack'}>{(plotView==='board'?stages:['전체']).map(stage=><div className="plot-column" key={stage}><div className="column-head"><span>{stage}</span><small>{scenes.filter(s=>stage==='전체'||s.stage===stage).length} scenes</small></div>{[...scenes].filter(s=>stage==='전체'||s.stage===stage).sort((a,b)=>a.order-b.order).map(s=><Card key={s.id} title={s.title} body={s.purpose||s.body} meta={<Pill>{s.stage}</Pill>} onClick={()=>edit('scenes',s)} footer={<><button title="위로 이동" className="tiny-button" onClick={()=>void swapScene(s,-1)}><ArrowUp size={14}/></button><button title="아래로 이동" className="tiny-button" onClick={()=>void swapScene(s,1)}><ArrowDown size={14}/></button><span>{s.nextIds.length?'다음: '+s.nextIds.map(next=>scenes.find(x=>x.id===next)?.title||'알 수 없음').join(' · '):'후속 장면 미지정'}</span></>}/>)}</div>)}</div>:<Empty title="플레이 진행을 설계해 보세요" description="장면은 여러 후속 장면에 연결할 수 있습니다." action={()=>edit('scenes',undefined,{stage:'발단',nextIds:[]})}/>):
    (events.length?<div className="timeline">{[...events].sort((a,b)=>plotView==='timeline'?(a.when||'').localeCompare(b.when||''):a.order-b.order).map((e,i)=><div className="timeline-item" key={e.id}><span className="timeline-dot">{i+1}</span><Card title={e.title} body={e.body} meta={<Pill>{e.when||'시점 미정'}</Pill>} onClick={()=>edit('events',e)} footer={<span>{e.cause&&'원인: '+e.cause}</span>}/></div>)}</div>:<Empty title="아직 기록된 사건이 없습니다" description="플레이 시작 이전에 일어난 사건도 등록할 수 있습니다." action={()=>edit('events')}/>)}
   <p className="hint">✦ 장면의 후속 경로는 장면 편집에서 복수로 선택합니다. 어느 한 경로만 강제하지 않습니다.</p>
  </>}
  {section==='questions'&&<>
   <Header eyebrow="QUESTION LAB" title="의문 해결실" description="설명되지 않는 부분을 질문으로 보관하고 가능한 가설을 비교합니다." action={()=>edit('questions',undefined,{status:'미해결',importance:'보통'})} actionText="+ 의문 등록"/>
   <div className="split-content"><div className="question-list">{questions.length?[...questions].sort((a,b)=>b.updatedAt-a.updatedAt).map(q=><button key={q.id} className={'question-row'+(selectedQuestion===q.id?' selected':'')} onClick={()=>setSelectedQuestion(q.id)}><span><Pill tone={q.status==='해결'?'success':'neutral'}>{q.status}</Pill><Pill>{q.importance}</Pill></span><strong>{q.title}</strong><small>가설 {hypotheses.filter(h=>h.questionId===q.id).length}개</small></button>):<Empty title="의문이 생겼다면 적어 두세요" description="불완전한 이유 설명도 가설로 기록할 수 있습니다." action={()=>edit('questions',undefined,{status:'미해결',importance:'보통'})}/>}</div>
   <div className="question-detail">{(()=>{const q=questions.find(x=>x.id===selectedQuestion)||questions[0];if(!q)return <div className="empty quiet"><CircleHelp size={38}/><p>질문을 선택하면 여기에 가설들이 표시됩니다.</p></div>;return <><div className="detail-top"><div><div className="eyebrow">CURRENT QUESTION</div><h2>{q.title}</h2><p>{q.context}</p></div><Button variant="soft" onClick={()=>edit('questions',q)}>편집</Button></div><div className="section-caption"><h3>해결 가설</h3><Button variant="soft" onClick={()=>edit('hypotheses',undefined,{questionId:q.id,status:'검토'})}><Plus size={15}/> 가설 추가</Button></div>
    {hypotheses.filter(h=>h.questionId===q.id).map(h=><div className="hypothesis" key={h.id}><div className="hypo-head"><Pill tone={h.status==='채택'?'success':'neutral'}>{h.status}</Pill><button className="text-link" onClick={()=>edit('hypotheses',h)}>편집</button></div><p>{h.body}</p>{h.evidence&&<small>근거: {h.evidence}</small>}{h.conflict&&<small>충돌: {h.conflict}</small>}{h.status!=='채택'&&<Button variant="soft" onClick={()=>void chooseHypothesis(h)}>이 가설 채택</Button>}</div>)}{!hypotheses.some(h=>h.questionId===q.id)&&<p className="muted">아직 가설이 없습니다. 서로 다른 설명을 자유롭게 비교해 보세요.</p>}</>;})()}</div></div>
  </>}
  {section==='archive'&&<>
   <Header eyebrow="WORLD & TRUTH" title="진상·설정 자료실" description="GM이 아는 사실과 플레이어가 발견할 정보를 구분해 관리합니다." action={()=>edit(archiveType,undefined,archiveType==='lore'?{kind:'세계관',private:true}:{audience:'전체'})} actionText={archiveType==='lore'?'+ 설정 추가':'+ 단서 추가'}/>
   <div className="tab-bar"><button className={archiveType==='lore'?'selected':''} onClick={()=>setArchiveType('lore')}>진상·설정 {lore.length}</button><button className={archiveType==='clues'?'selected':''} onClick={()=>setArchiveType('clues')}>단서 {clues.length}</button></div>
   {archiveType==='lore'?(lore.length?<div className="card-grid">{lore.map(l=><Card key={l.id} title={l.title} body={l.body} meta={<><Pill>{l.kind}</Pill>{l.private&&<Pill tone="warning">GM 전용</Pill>}</>} onClick={()=>edit('lore',l)}/>)}</div>:<Empty title="세계의 비밀을 정리해 보세요" description="인물·진상·HO·특수 규칙을 한곳에 모읍니다." action={()=>edit('lore',undefined,{kind:'진상',private:true})}/>):
    (clues.length?<div className="card-grid">{clues.map(c=><Card key={c.id} title={c.title} body={c.body} meta={<Pill>{c.audience||'공개 대상 미정'}</Pill>} onClick={()=>edit('clues',c)} footer={<span>{c.where||'발견 장면 미정'} · {c.alternate?'대체 경로 있음':'⚠ 대체 경로 미설정'}</span>}/>)}</div>:<Empty title="단서의 경로를 설계해 보세요" description="중요한 단서에는 대체 발견 경로를 마련할 수 있습니다." action={()=>edit('clues',undefined,{audience:'전체'})}/>)}
  </>}
  {section==='manuscript'&&<>
   <Header eyebrow="MANUSCRIPT" title="원고 편집기" description="하나의 연속 문서로 집필하고 제목과 목차로 이동합니다." action={()=>void exportDocx(id,project.title,false).catch(e=>alert(String(e)))} actionText="DOCX 다운로드"/>
   <ManuscriptEditor key={id} projectId={id}/>
   <p className="hint">DOCX 출력 시 일부 고급 서식·이미지는 원본과 다르게 표시될 수 있습니다. JSON 프로젝트 백업을 원본으로 보관해 주세요.</p>
  </>}
  {section==='settings'&&<>
   <Header eyebrow="PROJECT SETTINGS" title="프로젝트 설정" description="저장, 복원, 출력 및 프로젝트 정보를 관리합니다."/>
   <div className="settings-grid"><section className="settings-panel"><h2>기본 정보</h2><label className="field"><span>프로젝트 제목</span><input key={id+'title'} defaultValue={project.title} onBlur={e=>{void db.projects.update(id,{title:e.target.value.trim()||'제목 미정',updatedAt:now()});}}/></label><label className="field"><span>작품 유형</span><select value={project.kind} onChange={e=>void db.projects.update(id,{kind:e.target.value,updatedAt:now()})}>{['TRPG 시나리오','소설','기타'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>작업 방식</span><select value={project.mode} onChange={e=>void db.projects.update(id,{mode:e.target.value,updatedAt:now()})}>{['안내형','자유형','혼합형'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>서사 모델</span><select value={project.model} onChange={e=>void db.projects.update(id,{model:e.target.value,updatedAt:now()})}><option>사건 중심형</option><option>미스터리 역설계형</option></select></label></section>
   <section className="settings-panel"><h2>내보내기 · 백업</h2><p className="muted">작업 데이터는 현재 브라우저의 IndexedDB에 보관됩니다. 브라우저 데이터 삭제·기기 변경 전에 반드시 백업하세요.</p><div className="settings-actions"><Button onClick={()=>void downloadBackup(id)}><Download size={16}/> 전체 JSON 백업</Button><Button variant="soft" onClick={()=>void exportDocx(id,project.title,false)}><FileText size={16}/> 원고 DOCX</Button><Button variant="soft" onClick={()=>void exportDocx(id,project.title,true)}><BookOpen size={16}/> GM 자료 포함 DOCX</Button></div></section>
   <section className="settings-panel"><h2>프로젝트 관리</h2><p className="muted">복제하면 독립된 새 프로젝트가 생성됩니다. 삭제한 자료는 복구할 수 없습니다.</p><div className="settings-actions"><Button variant="soft" onClick={()=>void duplicateProject(id).then(p=>openProject(p.id)).catch(e=>alert(String(e)))}>프로젝트 복제</Button><Button variant="danger" onClick={()=>{if(confirm('정말 프로젝트와 모든 원고·카드를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'))void deleteProject(id).then(goHome);}}><Trash2 size={16}/> 프로젝트 삭제</Button></div></section>
   <section className="settings-panel"><h2>데이터 구조</h2><p className="muted">아이디어 출처를 포함한 내부 카드 관계 {relations.length}건이 ID 참조로 관리됩니다. 다른 기기에서 작업하려면 JSON을 내려받아 프로젝트 목록의 복원 기능을 이용하세요.</p><p className="muted small">PLOTWEAVER v0.1 · 로컬 우선 · 자동 클라우드 동기화 없음</p></section></div>
  </>}
  {dialog&&<ModalEditor key={(dialog.initial?.id as string)||dialog.table+'new'} title={dialog.title} fields={dialog.fields} initial={{...dialog.defaults,...dialog.initial}} onSave={saveDialog} onCancel={()=>setDialog(null)} onDelete={dialog.initial?.id?deleteDialog:undefined}/>}
 </div>;
}
export type {Section};
