import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
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
import { db, downloadBlob, emptyDocument, now } from './data';

const extensions=[
 StarterKit, Underline, Link.configure({openOnClick:false}),
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
function paragraphs(nodes:JSONContent[],level=0):Paragraph[]{
 const result:Paragraph[]=[];
 for(const node of nodes){
  if(node.type==='bulletList'||node.type==='orderedList'){
   for(const item of node.content||[])result.push(...paragraphs(item.content||[],level+1));
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
  }else if(node.type==='image')result.push(new Paragraph({children:[new TextRun('[이미지: 원고 편집기에서 확인]')]}));
  else if(node.content)result.push(...paragraphs(node.content,level));
 }
 return result;
}
export async function exportDocx(projectId:string,title:string,includePrivate:boolean){
 const record=await db.manuscripts.get(projectId);
 const nodes=record?.content.content||[];
 const children:(Paragraph|Table)[]=[];
 children.push(new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:260}}));
 for(const node of nodes){
  if(node.type==='table'){
   const rows=(node.content||[]).map(row=>new TableRow({children:(row.content||[]).map(cell=>new TableCell({
    columnSpan:cell.attrs?.colspan||1,
    rowSpan:cell.attrs?.rowspan||1,
    children:paragraphs(cell.content||[]).length?paragraphs(cell.content||[]):[new Paragraph('')]
   }))}));
   if(rows.length)children.push(new Table({rows,width:{size:100,type:'pct'}}));
  }else children.push(...paragraphs([node]));
 }
 if(includePrivate){
  const items=await db.lore.where('projectId').equals(projectId).toArray();
  if(items.length){
   children.push(new Paragraph({text:'GM 전용 자료',heading:HeadingLevel.HEADING_1,pageBreakBefore:true}));
   for(const item of items){
    children.push(new Paragraph({text:item.title,heading:HeadingLevel.HEADING_2}));
    children.push(new Paragraph({text:item.body}));
   }
  }
 }
 const document=new Document({sections:[{children}],creator:'PLOTWEAVER',title});
 const blob=await Packer.toBlob(document);
 downloadBlob(blob,title.replace(/[\\/:*?"<>|]/g,'_')+'.docx');
}
type Props={projectId:string};
export default function ManuscriptEditor({projectId}:Props){
 const record=useLiveQuery(()=>db.manuscripts.get(projectId),[projectId]);
 const [status,setStatus]=useState('불러오는 중');
 const [headings,setHeadings]=useState<{text:string;pos:number;level:number}[]>([]);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const pending=useRef<JSONContent|null>(null);
 const generation=useRef(0);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const loaded=useRef(false);
 // Capture the document at the time of the edit, not when a queued save eventually runs.
 function flush(){
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}
  const snapshot=pending.current;
  if(!snapshot)return;
  pending.current=null;
  const savingGeneration=generation.current;
  queue.current=queue.current.catch(()=>undefined).then(async()=>{
   await db.transaction('rw',db.manuscripts,db.projects,async()=>{
    await db.manuscripts.put({projectId,content:snapshot,updatedAt:now()});
    await db.projects.update(projectId,{updatedAt:now()});
   });
   if(savingGeneration===generation.current)setStatus('이 기기에 저장됨');
  }).catch(()=>{
   if(!pending.current)pending.current=snapshot;
   setStatus('⚠ 저장 실패 — 변경 내용이 아직 저장되지 않았습니다');
  });
 }
 useEffect(()=>()=>{flush();},[projectId]);
 const editor=useEditor({
  extensions,content:emptyDocument,editorProps:{attributes:{class:'document-page',spellcheck:'true'}},
  onUpdate:({editor})=>{
   const snapshot=editor.getJSON();
   generation.current++;
   pending.current=snapshot;
   setStatus('미저장 변경 · 저장 대기 중');
   if(timer.current!==null)clearTimeout(timer.current);
   timer.current=setTimeout(flush,450);
   setHeadings(collectHeadings(snapshot));
  }
 },[projectId]);
 useEffect(()=>{
  if(!editor||!record||loaded.current)return;
  editor.commands.setContent(record.content,false);
  loaded.current=true;setStatus('자동 저장됨');setHeadings(collectHeadings(record.content));
 },[record,editor]);
 if(!editor||record===undefined)return <div className="empty">저장된 원고를 불러오고 있습니다…</div>;
 const action=(label:string,cb:()=>void,active=false)=><button type="button" className={active?'tool active':'tool'} title={label} onClick={cb}>{label}</button>;
 const imagePick=async(file:File)=>{
  if(file.size>3*1024*1024){alert('이미지는 3MB 이하로 선택해 주세요.');return;}
  const reader=new FileReader();
  reader.onload=()=>editor.chain().focus().setImage({src:String(reader.result)}).run();
  reader.readAsDataURL(file);
 };
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
   <div className="eyebrow">DOCUMENT OUTLINE</div>
   <h3>문서 목차</h3>
   {headings.length?headings.map((h,i)=><button key={i} className="outline-link" style={{paddingLeft:8+(h.level-1)*12}} onClick={()=>{editor.commands.focus(h.pos);editor.view.dom.scrollIntoView({behavior:'smooth',block:'center'});}}>{h.text||'제목 없음'}</button>):<p className="muted small">제목 스타일을 지정하면 여기에 목차가 표시됩니다.</p>}
   <div className="outline-tip">💡 원고와 설계 카드는 독립적으로 저장됩니다. 카드의 수정이 본문을 덮어쓰지 않습니다.</div>
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
