import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { registerEditorFlusher } from './saveBarrier';

const guards = new Set<() => boolean>();
let listening = false;
function hasUnsaved() {
 return [...guards].some(check => check());
}
export function confirmUnsavedChanges() {
 return !hasUnsaved() || window.confirm('저장하지 않은 입력이 있습니다. 이동하면 해당 입력이 사라질 수 있습니다. 계속하시겠습니까?');
}
function confirmNavigation(event: MouseEvent) {
 const target=event.target;
 if(!(target instanceof Element)||!target.closest('[data-unsaved-navigation]')||!hasUnsaved())return;
 if(!confirmUnsavedChanges()){
  event.preventDefault();event.stopImmediatePropagation();
 }
}
function beforeUnload(event: BeforeUnloadEvent) {
 if(!hasUnsaved())return;
 event.preventDefault();event.returnValue='';
}
function subscribe(check:()=>boolean) {
 guards.add(check);
 if(!listening){
  document.addEventListener('click',confirmNavigation,true);
  window.addEventListener('beforeunload',beforeUnload);
  listening=true;
 }
 return ()=>{
  guards.delete(check);
  if(!guards.size){
   document.removeEventListener('click',confirmNavigation,true);
   window.removeEventListener('beforeunload',beforeUnload);
   listening=false;
  }
 };
}

/** Prevent navigation and backup while a form has changes that are not saved. */
export function useUnsavedChanges(projectId:string) {
 const ref=useRef(false);
 const [dirty,setDirty]=useState(false);
 useEffect(()=>{
  const unsubscribe=subscribe(()=>ref.current);
  const unregister=registerEditorFlusher(projectId,async()=>{
   if(ref.current)throw Error('저장하지 않은 시나리오 입력이 있습니다. 저장한 후 백업해 주세요.');
  });
  return ()=>{unsubscribe();unregister();};
 },[projectId]);
 return {
  dirty,
  onStructureClick:(event:React.MouseEvent)=>{
   const button=(event.target as Element).closest('button');
   if(button && ['조건 추가','조건 제거','하위 조건 추가','하위 조건 제거','변경 추가','변경 제거'].includes(button.textContent?.trim()||'')){
    ref.current=true;setDirty(true);
   }
  },
  markDirty:()=>{ref.current=true;setDirty(true);},
  markClean:()=>{ref.current=false;setDirty(false);}
 };
}
