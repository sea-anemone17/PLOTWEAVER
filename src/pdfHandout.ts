import type {Paragraph} from 'docx';
import {rasterHandoutParagraph} from './docxImages';

/** PDF pages are converted to bounded PNG page images, not embedded as an editable PDF. */
export async function pdfHandoutParagraphs(blob:Blob):Promise<Paragraph[]>{
 const pdfjs=await import('pdfjs-dist');
 const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const task=pdfjs.getDocument({data:bytes,useSystemFonts:true});
 const pdf=await task.promise;
 try{
  if(pdf.numPages>24)throw Error('PDF가 24페이지를 초과합니다. DOCX 변환 대신 PDF 원본을 별도 배포해 주세요.');
  const result:Paragraph[]=[];
  for(let index=1;index<=pdf.numPages;index++){
   const page=await pdf.getPage(index);
   const original=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:Math.min(1.5,900/original.width)});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw Error('PDF 페이지 렌더링을 사용할 수 없습니다.');
   await page.render({canvasContext:ctx,viewport}).promise;
   const pageImage=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PDF 페이지 이미지 변환 실패')),'image/png'));
   result.push(await rasterHandoutParagraph(pageImage));
   page.cleanup();
  }
  return result;
 }finally{await pdf.destroy();}
}
