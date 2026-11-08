import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type JSONContent, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TableExtension from '@tiptap/extension-table';
import TableRowExtension from '@tiptap/extension-table-row';
import TableHeaderExtension from '@tiptap/extension-table-header';
import TableCellExtension from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { useLiveQuery } from 'dexie-react-hooks';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } from 'docx';
import { db, downloadBlob, emptyDocument, now, fresh, touch } from './data';
import { TrpgBlock, TRPG_BLOCK_TYPES, TRPG_FIELD_SUGGESTIONS, type TrpgBlockKind } from './TrpgBlock';
import PlotMiniGraph from './PlotMiniGraph';
import { createPlotEdge, EDGE_TYPES, deletePlotEdge } from './plotEdges';
import type { PlotEdgeType } from './data';
import { flushProjectEdits, registerEditorFlusher, trackEditorWrite } from './saveBarrier';
import { profilePreset, validateExportProfile } from './exportProfiles';
import type { ExportProfile } from './data';

const extensions=[
 StarterKit, TrpgBlock, Underline, Link.configure({openOnClick:false}),
 Image.configure({inline:false,allowBase64:true}),
 TableExtension.configure({resizable:true}), TableRowExtension, TableHeaderExtension, TableCellExtension,
 TextAlign.configure({types:['paragraph','heading']}), TextStyle, Color
];
function textContent(node:JSONContent):string {
 return (node.text||'')+(node.content||[]).map(textContent).join('');
}
function run(node:JSONContent):TextRun{
 const marks=node.marks||[];
 const has=(name:string)=>marks.some(m=>m.type===name);
 const color=marks.find(m=>m.type==='textStyle')?.attrs?.color;
 return new TextRun({text:node.text||'',bold:has('bold'),italics:has('italic'),underline:has('underline')?{}:undefined,strike:has('strike'),color:typeof color==='string'?color.replace('#',''):undefined});
}
function paragraphs(nodes:JSONContent[],level=0,includePrivate=true):Paragraph[]{
 const result:Paragraph[]=[];
 for(const node of nodes){
  if(!includePrivate&&node.type==='trpgBlock'&&node.attrs?.kind==='gm')continue;
  if(node.type==='bulletList'||node.type==='orderedList'){
   for(const item of node.content||[])result.push(...paragraphs(item.content||[],level+1,includePrivate));
   continue;
  }
  if(node.type==='paragraph'||node.type==='heading'||node.type==='listItem'||node.type==='blockquote'){
   const children=(node.content||[]).filter(n=>n.type==='text'||n.type==='hardBreak').map(n=>n.type==='hardBreak'?new TextRun({break:1}):run(n));
   const lv=node.attrs?.level;
   const heading=node.type==='heading' && lv>=1 && lv<=6 ? ('Heading'+lv) as keyof typeof HeadingLevel:undefined;
   result.push(new Paragraph({
    heading:heading?HeadingLevel[heading]:undefined,
    children:children.length?children:[new TextRun('')],
    bullet:level>0?{level:Math.min(level-1,7)}:undefined,
    spacing:{after:100}
   }));
  }else if(node.type==='trpgBlock'){
   const kind=node.attrs?.kind as TrpgBlockKind;
   const label=TRPG_BLOCK_TYPES[kind]||'TRPG 블록';
   result.push(new Paragraph({text:'['+label+']',spacing:{before:180,after:80}}));
   result.push(...paragraphs(node.content||[],level,includePrivate));
   const fields=node.attrs?.fields;
   if(fields&&typeof fields==='object'&&!Array.isArray(fields)){
    for(const [name,value] of Object.entries(fields as Record<string,unknown>)){
     if(typeof value!=='string'||!value.trim())continue;
     result.push(new Paragraph({children:[new TextRun({text:name+': ',bold:true}),new TextRun(value)],spacing:{after:80}}));
    }
   }
  }else if(node.type==='image')result.push(new Paragraph({children:[new TextRun('[이미지: 원고 편집기에서 확인]')]}));
  else if(node.content)result.push(...paragraphs(node.content,level,includePrivate));
 }
 return result;
}
export async function buildDocxBlob(projectId:string,title:string,settings:boolean|ExportProfile):Promise<Blob>{
 await flushProjectEdits(projectId);
 const profile:ExportProfile=typeof settings==='boolean'?profilePreset(projectId,settings?'gm':'player'):settings;
 validateExportProfile(profile);
 if(profile.projectId!==projectId)throw Error('다른 프로젝트의 출력 프로필입니다.');
 const record=await db.manuscripts.get(projectId);
 const sceneDocs=await db.sceneDocs.where('projectId').equals(projectId).toArray();
 const scenes=await db.scenes.where('projectId').equals(projectId).filter(scene=>!scene.deletedAt).toArray();
 const handouts=profile.includeHandouts?await db.handouts.where('projectId').equals(projectId).toArray():[];
 const children:(Paragraph|Table)[]=[];
 children.push(new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:260}}));
 const appendNodes=(nodes:JSONContent[])=>{
  for(const node of nodes){
   if(node.type==='table'){
    const rows=(node.content||[]).map(row=>new TableRow({children:(row.content||[]).map(cell=>new TableCell({
     columnSpan:cell.attrs?.colspan||1,
     rowSpan:cell.attrs?.rowspan||1,
     children:paragraphs(cell.content||[],0,profile.includePrivate).length?paragraphs(cell.content||[],0,profile.includePrivate):[new Paragraph('')]
    }))}));
    if(rows.length)children.push(new Table({rows,width:{size:100,type:'pct'}}));
   }else children.push(...paragraphs([node],0,profile.includePrivate));
  }
 };
 const legacy=record?.content.content||[];
 if(profile.includeLegacy&&legacy.some(n=>textContent(n).trim()||n.type==='image'||n.type==='table')){
  if(profile.includeScenes&&sceneDocs.length)children.push(new Paragraph({text:'기존 연속 원고',heading:HeadingLevel.HEADING_1}));
  appendNodes(legacy);
 }
 if(profile.includeScenes){
  const docs=new Map(sceneDocs.map(d=>[d.sceneId,d]));
  for(const scene of scenes.sort((a,b)=>a.order-b.order)){
   const document=docs.get(scene.id);
   if(!document)continue;
   children.push(new Paragraph({text:scene.title,heading:HeadingLevel.HEADING_1}));
   appendNodes(document.content.content||[]);
  }
 }
 const visibleHandouts=handouts.filter(h=>h.visibility==='player'||(profile.includePrivate&&h.visibility==='gm'));
 if(visibleHandouts.length){
  children.push(new Paragraph({text:'핸드아웃',heading:HeadingLevel.HEADING_1,pageBreakBefore:true}));
  for(const handout of visibleHandouts){
   children.push(new Paragraph({text:handout.title,heading:HeadingLevel.HEADING_2}));
   if(handout.kind==='text')appendNodes(handout.content.content||[]);
   else children.push(new Paragraph({text:'[파일 핸드아웃 — 실제 이미지/PDF는 ZIP 백업 또는 별도 파일로 전달해야 합니다.]'}));
  }
 }
 if(profile.includePrivate&&profile.includeGMResources){
  const items=await db.lore.where('projectId').equals(projectId).toArray();
  if(items.length){
   children.push(new Paragraph({text:'GM 전용 자료',heading:HeadingLevel.HEADING_1,pageBreakBefore:true}));
   for(const item of items){
    children.push(new Paragraph({text:item.title,heading:HeadingLevel.HEADING_2}));
    children.push(new Paragraph({text:item.body}));
   }
  }
 }
 if(children.length===1)throw Error('출력할 원고가 없습니다. 출력 프로필에서 포함 범위를 확인해 주세요.');
 const pageMargin=profile.pageMargin;
 const document=new Document({
  sections:[{properties:{page:{margin:{top:pageMargin,bottom:pageMargin,left:pageMargin,right:pageMargin}}},children}],
  styles:{default:{document:{run:{font:profile.fontFamily,size:profile.fontSize*2}}}},
  creator:'PLOTWEAVER',title
 });
 return Packer.toBlob(document);
}
export async function exportDocx(projectId:string,title:string,settings:boolean|ExportProfile){
 const profile=typeof settings==='boolean'?profilePreset(projectId,settings?'gm':'player'):settings;
 const blob=await buildDocxBlob(projectId,title,profile);
 downloadBlob(blob,title.replace(/[\\/:*?"<>|]/g,'_')+' - '+profile.name.replace(/[\\/:*?"<>|]/g,'_')+'.docx');
}
type PanelTab='outline'|'overview'|'characters'|'information'|'narrative';
type Props={projectId:string;sceneId?:string;onSelectScene?:(id:string)=>void;onOpenPlot?:()=>void};
export default function ManuscriptEditor({projectId,sceneId,onSelectScene,onOpenPlot}:Props){
 const record=useLiveQuery(async()=>sceneId?(await db.sceneDocs.where('sceneId').equals(sceneId).first())??null:(await db.manuscripts.get(projectId))??null,[projectId,sceneId]);
 const scene=useLiveQuery(()=>sceneId?db.scenes.get(sceneId):undefined,[sceneId]);
 const projectScenes=useLiveQuery(()=>db.scenes.where('projectId').equals(projectId).filter(scene=>!scene.deletedAt).toArray(),[projectId],[]);
 const lore=useLiveQuery(()=>db.lore.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const clues=useLiveQuery(()=>db.clues.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const links=useLiveQuery(()=>sceneId?db.sceneLinks.where('sceneId').equals(sceneId).toArray():[],[sceneId],[]);
 const plotEdges=useLiveQuery(()=>db.plotEdges.where('projectId').equals(projectId).toArray(),[projectId],[]);
 const [panel,setPanel]=useState<PanelTab>(sceneId?'overview':'outline');
 const [pick,setPick]=useState('');
 const [nextScene,setNextScene]=useState('');
 const [edgeKind,setEdgeKind]=useState<PlotEdgeType>('normal');
 const [branchEdgeId,setBranchEdgeId]=useState<string|null>(null);
 const [activeBlock,setActiveBlock]=useState<{pos:number;kind:TrpgBlockKind;fields:Record<string,string>}|null>(null);
 const [newField,setNewField]=useState('');
 const [status,setStatus]=useState('불러오는 중');
 const [headings,setHeadings]=useState<{text:string;pos:number;level:number}[]>([]);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const pending=useRef<JSONContent|null>(null);
 const generation=useRef(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const loaded=useRef(false);
 function trackSelectedBranch(current:TiptapEditor){
  const $from=current.state.selection.$from;
  for(let depth=$from.depth;depth>0;depth--){
   const node=$from.node(depth);
   if(node.type.name==='trpgBlock'){
    const kind=node.attrs.kind as TrpgBlockKind;
    const raw=node.attrs.fields;
    const fields:Record<string,string>=raw&&typeof raw==='object'&&!Array.isArray(raw)?Object.fromEntries(Object.entries(raw as Record<string,unknown>).filter((entry):entry is [string,string]=>typeof entry[1]==='string')):{};
    setActiveBlock({pos:$from.before(depth),kind,fields});
    setBranchEdgeId(kind==='branch'?(typeof node.attrs.edgeId==='string'?node.attrs.edgeId:''):null);
    return;
   }
  }
  setBranchEdgeId(null);
  setActiveBlock(null);
 }
 // Capture the document at the time of the edit, not when a queued save eventually runs.
 function flush():Promise<void>{
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}
  const snapshot=pending.current;
  if(!snapshot)return queue.current.then(()=>undefined);
  pending.current=null;
  const savingGeneration=generation.current;
  queue.current=queue.current.catch(()=>undefined).then(async()=>{
   await db.transaction('rw',db.manuscripts,db.sceneDocs,db.scenes,db.projects,async()=>{
    if(!await db.projects.get(projectId))throw Error('삭제된 프로젝트에는 원고를 저장할 수 없습니다.');
    if(sceneId){
     if(!await db.scenes.get(sceneId))throw Error('삭제된 장면에는 원고를 저장할 수 없습니다.');
     const previous=await db.sceneDocs.where('sceneId').equals(sceneId).first();
     await db.sceneDocs.put({id:previous?.id||crypto.randomUUID(),sceneId,projectId,content:snapshot,updatedAt:now()});
    }else await db.manuscripts.put({projectId,content:snapshot,updatedAt:now()});
    await db.projects.update(projectId,{updatedAt:now()});
   });
   if(savingGeneration===generation.current)setStatus('이 기기에 저장됨');
  }).catch((error:unknown)=>{
   if(!pending.current)pending.current=snapshot;
   setStatus('⚠ 저장 실패 — 변경 내용이 아직 저장되지 않았습니다');
   throw error;
  });
  trackEditorWrite(projectId,queue.current);
  return queue.current.then(()=>undefined);
 }
 useEffect(()=>registerEditorFlusher(projectId,flush),[projectId,sceneId]);
 useEffect(()=>()=>{void flush().catch(()=>undefined);},[projectId,sceneId]);
 const editor=useEditor({
  extensions,content:emptyDocument,editorProps:{attributes:{class:'document-page',spellcheck:'true'}},
  onSelectionUpdate:({editor})=>trackSelectedBranch(editor),
  onUpdate:({editor})=>{
   trackSelectedBranch(editor);
   const snapshot=editor.getJSON();
   generation.current++;
   pending.current=snapshot;
   setStatus('미저장 변경 · 저장 대기 중');
   if(timer.current!==null)clearTimeout(timer.current);
   timer.current=setTimeout(flush,450);
   setHeadings(collectHeadings(snapshot));
  }
 },[projectId,sceneId]);
 useEffect(()=>{
  if(!editor||record===undefined||loaded.current)return;
  const content=record?.content||emptyDocument;
  editor.commands.setContent(content,false);
  loaded.current=true;setStatus(record?'이 기기에 저장됨':'새 장면 원고');setHeadings(collectHeadings(content));trackSelectedBranch(editor);
 },[record,editor]);
 if(!editor||record===undefined)return <div className="empty">저장된 원고를 불러오고 있습니다…</div>;
 const action=(label:string,cb:()=>void,active=false)=><button type="button" className={active?'tool active':'tool'} title={label} onClick={cb}>{label}</button>;
 const imagePick=async(file:File)=>{
  if(file.size>3*1024*1024){alert('이미지는 3MB 이하로 선택해 주세요.');return;}
  const reader=new FileReader();
  reader.onload=()=>editor.chain().focus().setImage({src:String(reader.result)}).run();
  reader.readAsDataURL(file);
 };
 async function addResource(kind:'lore'|'clues'){
  if(!sceneId||!pick)return;
  if(links.some(l=>l.resourceId===pick&&l.resourceKind===kind))return;
  try{
   await db.sceneLinks.add({...fresh(projectId),sceneId,resourceId:pick,resourceKind:kind,role:''});
   await touch(projectId);setPick('');
  }catch(e){alert('자료 연결 실패: '+String(e));}
 }
 async function removeResource(id:string){
  try{await db.sceneLinks.delete(id);await touch(projectId);}
  catch(e){alert('자료 연결 해제 실패: '+String(e));}
 }
 function updateStructuredFields(fields:Record<string,string>){
  if(!activeBlock||!editor)return;
  const node=editor.state.doc.nodeAt(activeBlock.pos);
  if(!node||node.type.name!=='trpgBlock')return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(activeBlock.pos,undefined,{...node.attrs,fields}));
  setActiveBlock({...activeBlock,fields});
 }
 async function addSceneEdge(){
  if(!sceneId)return;
  try{
   await createPlotEdge(projectId,{fromSceneId:sceneId,toSceneId:nextScene,type:edgeKind,label:'',condition:'',note:''});
   setNextScene('');
  }catch(e){alert('진행 관계 추가 실패: '+String(e));}
 }
 async function removeSceneEdge(edgeId:string){
  if(!confirm('이 진행 관계를 해제하시겠습니까? 연결된 장면과 원고는 유지됩니다.'))return;
  try{await deletePlotEdge(projectId,edgeId);}
  catch(e){alert('진행 관계 삭제 실패: '+String(e));}
 }
 const documentOutline=<>
  <div className="eyebrow">DOCUMENT OUTLINE</div>
  <h3>문서 목차</h3>
  {headings.length?headings.map((h,i)=><button key={i} className="outline-link" style={{paddingLeft:8+(h.level-1)*12}} onClick={()=>{editor.commands.focus(h.pos);editor.view.dom.scrollIntoView({behavior:'smooth',block:'center'});}}>{h.text||'제목 없음'}</button>):<p className="muted small">제목 스타일을 지정하면 여기에 목차가 표시됩니다.</p>}
 </>;
 return <div className="manuscript-layout">
  <div className="document-area">
   <div className="editor-toolbar">
    {action('↶',()=>editor.chain().focus().undo().run())}
    {action('↷',()=>editor.chain().focus().redo().run())}
    <span className="toolbar-sep"/>
    <select className="tool-select" aria-label="문단 스타일" value={editor.isActive('heading',{level:1})?'1':editor.isActive('heading',{level:2})?'2':editor.isActive('heading',{level:3})?'3':editor.isActive('heading',{level:4})?'4':editor.isActive('heading',{level:5})?'5':editor.isActive('heading',{level:6})?'6':'p'} onChange={e=>{const v=e.target.value;v==='p'?editor.chain().focus().setParagraph().run():editor.chain().focus().toggleHeading({level:Number(v) as 1|2|3|4|5|6}).run();}}>
     <option value="p">본문</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>제목 {n}</option>)}
    </select>
    {action('B',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
    {action('I',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
    {action('U',()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
    {action('S̶',()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike'))}
    <input type="color" className="color-control" title="텍스트 색상" defaultValue="#22263a" onChange={e=>editor.chain().focus().setColor(e.target.value).run()}/>
    <span className="toolbar-sep"/>
    {action('☷',()=>editor.chain().focus().setTextAlign('left').run())}
    {action('☰',()=>editor.chain().focus().setTextAlign('center').run())}
    {action('• 목록',()=>editor.chain().focus().toggleBulletList().run())}
    {action('1. 목록',()=>editor.chain().focus().toggleOrderedList().run())}
    {action('❝',()=>editor.chain().focus().toggleBlockquote().run())}
    <select className="tool-select" aria-label="TRPG 전용 블록 삽입" value="" onChange={e=>{
     const kind=e.target.value as TrpgBlockKind;
     if(!kind)return;
     editor.chain().focus().insertContent({type:'trpgBlock',attrs:{kind},content:[{type:'paragraph'}]}).run();
    }}>
     <option value="">+ TRPG 블록</option>
     {Object.entries(TRPG_BLOCK_TYPES).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
    </select>
    {action('링크',()=>{const url=prompt('연결할 URL을 입력하세요');if(url)editor.chain().focus().setLink({href:url}).run();})}
    {action('표 +',()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run())}
    {action('셀 병합',()=>editor.chain().focus().mergeCells().run())}
    {action('셀 분리',()=>editor.chain().focus().splitCell().run())}
    {action('행 +',()=>editor.chain().focus().addRowAfter().run())}
    {action('열 +',()=>editor.chain().focus().addColumnAfter().run())}
    {action('표 삭제',()=>editor.chain().focus().deleteTable().run())}
    <label className="tool upload-tool">이미지 +<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void imagePick(f);e.target.value='';}}/></label>
   </div>
   <div className="editor-scroll"><EditorContent editor={editor}/></div>
   <div className="editor-footer"><span>{status}</span><span>{editor.storage.characterCount?.characters?.()??textContent(editor.getJSON()).length}자 · 원고</span></div>
  </div>
  <aside className="outline">
   {sceneId?<>
    <div className="eyebrow">SCENE CONTEXT</div>
    <h3>장면 자료</h3>
    <div className="context-tabs" role="tablist" aria-label="장면 자료 탭">
     {([{key:'overview',label:'개요'},{key:'characters',label:'등장'},{key:'information',label:'정보'},{key:'narrative',label:'서사'}] as const).map(t=><button key={t.key} type="button" role="tab" aria-selected={panel===t.key} className={panel===t.key?'active':''} onClick={()=>{setPanel(t.key);setPick('');}}>{t.label}</button>)}
    </div>
    {activeBlock&&<div className="context-section block-structure">
      <h4>선택한 블록 · {TRPG_BLOCK_TYPES[activeBlock.kind]}</h4>
      <p className="muted small">자유 서술은 유지하고, 필요한 정보만 별도 항목으로 기록합니다.</p>
      {Object.entries(activeBlock.fields).map(([name,value])=><div className="block-field" key={name}>
       <label>{name}<textarea rows={2} value={value} onChange={e=>updateStructuredFields({...activeBlock.fields,[name]:e.target.value})}/></label>
       <button type="button" onClick={()=>{const next={...activeBlock.fields};delete next[name];updateStructuredFields(next);}}>항목 제거</button>
      </div>)}
      <input list="pw-trpg-field-list" aria-label="추가할 항목 이름" value={newField} onChange={e=>setNewField(e.target.value)} placeholder="새 항목 이름"/>
      <datalist id="pw-trpg-field-list">{TRPG_FIELD_SUGGESTIONS[activeBlock.kind].map(name=><option key={name} value={name}/>)}</datalist>
      <button type="button" className="tool" disabled={!newField.trim()||Object.prototype.hasOwnProperty.call(activeBlock.fields,newField.trim())} onClick={()=>{
       const name=newField.trim();
       if(!name||Object.prototype.hasOwnProperty.call(activeBlock.fields,name))return;
       updateStructuredFields({...activeBlock.fields,[name]:''});setNewField('');
      }}>구조화 항목 추가</button>
     </div>}
     {panel==='overview'&&<div className="context-section"><h4>{scene?.title||'장면 정보'}</h4><p><strong>목적</strong> {scene?.purpose||'아직 작성되지 않았습니다.'}</p><p><strong>진입</strong> {scene?.entry||'미정'}</p><p><strong>결과</strong> {scene?.outcome||'미정'}</p><p className="muted small">장면 정보는 플롯 보드의 장면 편집에서 수정합니다.</p></div>}
    {panel==='characters'&&<div className="context-section"><h4>등장 NPC</h4>
      {links.filter(l=>l.resourceKind==='lore').length?links.filter(l=>l.resourceKind==='lore').map(l=><div className="context-link" key={l.id}><span>{lore.find(x=>x.id===l.resourceId)?.title||'연결된 자료가 없습니다'}</span><button type="button" onClick={()=>void removeResource(l.id)}>해제</button></div>):<p className="muted small">이 장면에 연결된 NPC가 없습니다.</p>}
      <select aria-label="등장 NPC 선택" value={pick} onChange={e=>setPick(e.target.value)}><option value="">NPC 선택…</option>{lore.filter(l=>l.kind==='NPC'&&!links.some(x=>x.resourceId===l.id)).map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select>
      <button className="tool" type="button" disabled={!pick} onClick={()=>void addResource('lore')}>NPC 연결</button>
     </div>}
    {panel==='information'&&<div className="context-section"><h4>단서·정보</h4>
      {links.filter(l=>l.resourceKind==='clues').length?links.filter(l=>l.resourceKind==='clues').map(l=><div className="context-link" key={l.id}><span>{clues.find(x=>x.id===l.resourceId)?.title||'연결된 자료가 없습니다'}</span><button type="button" onClick={()=>void removeResource(l.id)}>해제</button></div>):<p className="muted small">이 장면에 연결된 단서가 없습니다.</p>}
      <select aria-label="단서 선택" value={pick} onChange={e=>setPick(e.target.value)}><option value="">단서 선택…</option>{clues.filter(c=>!links.some(l=>l.resourceId===c.id)).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
      <button className="tool" type="button" disabled={!pick} onClick={()=>void addResource('clues')}>단서 연결</button>
     </div>}
    {panel==='narrative'&&<div className="context-section"><h4>현재 장면의 진행 관계</h4>
      <PlotMiniGraph sceneId={sceneId} scenes={projectScenes} edges={plotEdges} onNavigate={onSelectScene}/>
      <div className="context-link"><span>전체 플롯 관계도</span><button type="button" onClick={onOpenPlot}>열기</button></div>
      {branchEdgeId!==null&&<div className="branch-binding">
        <h4>선택 중인 원고 분기 블록</h4>
        <p className="muted small">현재 커서가 위치한 분기 블록에 실제 진행 관계를 연결합니다. 블록 삭제 시 관계는 유지됩니다.</p>
        <select aria-label="분기 블록의 연결 관계" value={branchEdgeId} onChange={e=>{
         const value=e.target.value;
         editor.chain().focus().updateAttributes('trpgBlock',{edgeId:value||null}).run();
         setBranchEdgeId(value);
        }}>
         <option value="">아직 연결하지 않음</option>
         {branchEdgeId&&!plotEdges.some(e=>e.id===branchEdgeId)&&<option value={branchEdgeId}>삭제되거나 누락된 연결</option>}
         {plotEdges.filter(e=>e.fromSceneId===sceneId).map(edge=><option key={edge.id} value={edge.id}>{edge.label||'선택 분기'} → {edge.toSceneId?projectScenes.find(s=>s.id===edge.toSceneId)?.title||'삭제된 장면':'미정'}</option>)}
        </select>
       </div>}
       <h4>다음 장면 연결</h4>
      <select aria-label="다음 장면 선택" value={nextScene} onChange={e=>setNextScene(e.target.value)}>
       <option value="">아직 결정하지 않음</option>
       {projectScenes.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <select aria-label="진행 유형" value={edgeKind} onChange={e=>setEdgeKind(e.target.value as PlotEdgeType)}>
       {EDGE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <button type="button" className="tool" onClick={()=>void addSceneEdge()}>진행 관계 추가</button>
      {plotEdges.filter(e=>e.fromSceneId===sceneId).map(edge=><div className="context-link" key={edge.id}>
       <span>{edge.toSceneId?projectScenes.find(s=>s.id===edge.toSceneId)?.title||'삭제된 장면':'다음 장면 미정'} · {EDGE_TYPES.find(t=>t.value===edge.type)?.label||edge.type}</span>
       <button type="button" onClick={()=>void removeSceneEdge(edge.id)}>해제</button>
      </div>)}
      <p className="muted small">조건, 메모, 선택지 이름은 전체 관계도에서 편집할 수 있습니다.</p>
     </div>}
    <details className="context-outline"><summary>현재 장면 목차</summary>{documentOutline}</details>
   </>:<>{documentOutline}<div className="outline-tip">💡 기존 연속 원고는 보존됩니다. 장면별 원고는 위의 장면 선택 메뉴에서 편집할 수 있습니다.</div></>}
  </aside>
 </div>;
}
function collectHeadings(doc:JSONContent){
 const result:{text:string;pos:number;level:number}[]=[];
 let pos=0;
 const walk=(node:JSONContent)=>{
  if(node.type==='heading')result.push({text:textContent(node),pos:pos+1,level:Number(node.attrs?.level)||1});
  pos+=1;
  if(node.content)for(const child of node.content)walk(child);
  pos+=1;
 };
 for(const node of doc.content||[])walk(node);
 return result;
}
