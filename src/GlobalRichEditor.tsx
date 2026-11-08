import {useEffect,useRef,useState} from 'react';
import {useEditor,EditorContent,type JSONContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import {registerEditorFlusher,trackEditorWrite} from './saveBarrier';

type Option={id:string;title:string};
type Props={
 documentId:string;content:JSONContent;onSave:(value:JSONContent)=>Promise<unknown>;
 internalNotes?:Option[];onOpenLink?:(id:string)=>void;
};
const extensions=[StarterKit,Underline,Link.configure({openOnClick:false})];
export default function GlobalRichEditor({documentId,content,onSave,internalNotes=[],onOpenLink}:Props){
 const [status,setStatus]=useState('불러오는 중');
 const [query,setQuery]=useState('');
 const [showSuggestions,setShowSuggestions]=useState(false);
 const pending=useRef<JSONContent|null>(null);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const onSaveRef=useRef(onSave);
 onSaveRef.current=onSave;

 function flush():Promise<void>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const snapshot=pending.current;
  if(!snapshot)return queue.current.then(()=>undefined);
  pending.current=null;
  queue.current=queue.current.catch(()=>undefined).then(()=>onSaveRef.current(snapshot)).then(()=>setStatus('이 기기에 저장됨')).catch(error=>{
   if(!pending.current)pending.current=snapshot;
   setStatus('⚠ 저장 실패 · 변경 내용을 백업하세요');
   throw error;
  });
  trackEditorWrite('__global__',queue.current);
  return queue.current.then(()=>undefined);
 }
 useEffect(()=>registerEditorFlusher('__global__',flush),[documentId]);
 useEffect(()=>()=>{void flush().catch(()=>undefined);},[documentId]);
 const editor=useEditor({
  extensions,
  content,
  editorProps:{
   attributes:{class:'research-editor-page',spellcheck:'true'},
   handleClick:(_view,_pos,event)=>{
    const target=event.target;
    if(!(target instanceof HTMLElement))return false;
    const link=target.closest('a[href^="pw://knowledge/"]');
    if(!link)return false;
    event.preventDefault();
    const id=link.getAttribute('href')?.replace('pw://knowledge/','');
    if(id)onOpenLink?.(id);
    return true;
   }
  },
  onUpdate:({editor})=>{
   pending.current=editor.getJSON();setStatus('저장 대기 중');
   if(timer.current)clearTimeout(timer.current);
   timer.current=setTimeout(()=>{void flush().catch(()=>undefined);},450);
   if(!internalNotes.length){setShowSuggestions(false);return;}
   const {$from}=editor.state.selection;
   const before=$from.parent.textBetween(0,$from.parentOffset);
   const match=before.match(/\[\[([^\]]{0,60})$/);
   if(match){setQuery(match[1]);setShowSuggestions(true);}
   else setShowSuggestions(false);
  }
 },[documentId]);
 if(!editor)return <div className="empty">편집기를 불러오는 중입니다…</div>;
 const insertNote=(option:Option)=>{
  const {$from}=editor.state.selection;
  const before=$from.parent.textBetween(0,$from.parentOffset);
  const match=before.match(/\[\[([^\]]{0,60})$/);
  if(!match){setShowSuggestions(false);return;}
  const end=$from.pos,start=end-match[0].length;
  editor.chain().focus().deleteRange({from:start,to:end}).insertContent({
   type:'text',text:option.title,marks:[{type:'link',attrs:{href:'pw://knowledge/'+option.id,target:null}}]
  }).run();
  setShowSuggestions(false);
 };
 const candidates=internalNotes.filter(x=>x.id!==documentId&&x.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0,8);
 const action=(label:string,callback:()=>void,active=false)=><button type="button" className={'tool'+(active?' active':'')} onClick={callback}>{label}</button>;
 return <section className="research-rich">
  <div className="editor-toolbar">
   {action('B',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
   {action('I',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
   {action('U',()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
   <span className="toolbar-sep"/>
   {action('제목',()=>editor.chain().focus().toggleHeading({level:2}).run(),editor.isActive('heading',{level:2}))}
   {action('소제목',()=>editor.chain().focus().toggleHeading({level:3}).run(),editor.isActive('heading',{level:3}))}
   {action('목록',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
   {action('인용',()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote'))}
   <span className="toolbar-sep"/>
   {action('되돌리기',()=>editor.chain().focus().undo().run())}
   {action('다시하기',()=>editor.chain().focus().redo().run())}
  </div>
  <EditorContent editor={editor}/>
  {showSuggestions&&candidates.length>0&&<div className="research-suggest" role="listbox" aria-label="지식 문서 링크">
   <small>[[ 지식 문서 연결</small>
   {candidates.map(option=><button type="button" key={option.id} onMouseDown={e=>e.preventDefault()} onClick={()=>insertNote(option)}>{option.title}</button>)}
  </div>}
  <footer className="research-save-status">{status} · 제목과 자료 관계는 별도로 저장됩니다.</footer>
 </section>;
}
