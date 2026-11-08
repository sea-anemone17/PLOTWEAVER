import { useState } from 'react';
import { X, Check, Trash2, Plus, ArrowRight } from 'lucide-react';

export type Field={
 key:string;label:string;kind?:'text'|'textarea'|'select'|'checkbox'|'multi';
 options?:{value:string;label:string}[];placeholder?:string;required?:boolean;
};
export function Button({children,onClick,variant='primary',disabled=false,type='button'}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'soft'|'ghost'|'danger';disabled?:boolean;type?:'button'|'submit'}){
 return <button type={type} disabled={disabled} className={'button '+variant} onClick={onClick}>{children}</button>;
}
export function Empty({title,description,action}:{title:string;description:string;action?:()=>void}){
 return <div className="empty"><span className="empty-mark">✧</span><h3>{title}</h3><p>{description}</p>{action&&<Button onClick={action}><Plus size={16}/> 첫 항목 만들기</Button>}</div>;
}
export function Header({eyebrow,title,description,action,actionText='+ 새 카드'}:{eyebrow:string;title:string;description:string;action?:()=>void;actionText?:string}){
 return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action&&<Button onClick={action}>{actionText}</Button>}</div>;
}
export function Pill({children,tone='neutral'}:{children:React.ReactNode;tone?:string}){return <span className={'pill '+tone}>{children}</span>;}
export function ModalEditor({title,fields,initial,onSave,onCancel,onDelete}:{
 title:string;fields:Field[];initial?:Record<string,unknown>;
 onSave:(values:Record<string,any>)=>Promise<void>|void;onCancel:()=>void;onDelete?:()=>Promise<void>|void;
}){
 const [draft,setDraft]=useState<Record<string,any>>({...initial});
 const [busy,setBusy]=useState(false);
 const update=(key:string,value:unknown)=>setDraft(prev=>({...prev,[key]:value}));
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);
  try{await onSave(draft);onCancel();}catch(error){alert(error instanceof Error?error.message:'저장하지 못했습니다.');}finally{setBusy(false);}
 }
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
  <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
   <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onCancel} aria-label="닫기"><X size={20}/></button></div>
   <form onSubmit={submit} className="modal-form">
    {fields.map(field=><label className="field" key={field.key}>
     <span>{field.label}</span>
     {field.kind==='textarea'?<textarea rows={4} placeholder={field.placeholder||''} value={draft[field.key]??''} onChange={e=>update(field.key,e.target.value)}/>:
      field.kind==='select'?<select value={draft[field.key]??''} onChange={e=>update(field.key,e.target.value)}><option value="">선택하지 않음</option>{(field.options||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
      field.kind==='checkbox'?<input type="checkbox" checked={Boolean(draft[field.key])} onChange={e=>update(field.key,e.target.checked)}/>:
      field.kind==='multi'?<div className="multi-options">{(field.options||[]).map(o=><label key={o.value} className="checkbox-line"><input type="checkbox" checked={Array.isArray(draft[field.key])&&draft[field.key].includes(o.value)} onChange={e=>update(field.key,e.target.checked?[...new Set([...(draft[field.key]||[]),o.value])]:(draft[field.key]||[]).filter((v:string)=>v!==o.value))}/>{o.label}</label>)}</div>:
      <input required={field.required} value={draft[field.key]??''} placeholder={field.placeholder||''} onChange={e=>update(field.key,e.target.value)}/>}
    </label>)}
    <div className="modal-actions">{onDelete&&<Button variant="danger" onClick={async()=>{if(confirm('이 카드를 삭제하시겠습니까?')){await onDelete();onCancel();}}}><Trash2 size={16}/> 삭제</Button>}<span className="grow"/><Button variant="soft" onClick={onCancel}>취소</Button><button disabled={busy} className="button primary" type="submit"><Check size={16}/>{busy?'저장 중…':'저장'}</button></div>
   </form>
  </section>
 </div>;
}
export function Card({title,body,meta,footer,onClick,children}:{title:string;body?:string;meta?:React.ReactNode;footer?:React.ReactNode;onClick?:()=>void;children?:React.ReactNode}){
 return <article className={'content-card'+(onClick?' interactive':'')}>
  <div className="card-main" onClick={onClick} role={onClick?'button':undefined} tabIndex={onClick?0:undefined} onKeyDown={e=>{if(onClick&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onClick();}}}>
   {meta&&<div className="card-meta">{meta}</div>}<h3>{title||'제목 없음'}</h3>{body&&<p className="card-body">{body}</p>}
  </div>
  {children}
  {(footer||onClick)&&<div className="card-footer">{footer}{onClick&&<button className="text-link" onClick={onClick}>편집 <ArrowRight size={14}/></button>}</div>}
 </article>;
}
