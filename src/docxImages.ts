import {ImageRun,Paragraph,TextRun} from 'docx';

/** Converts browser-supported raster images to PNG for a portable DOCX package. */
export async function rasterHandoutParagraph(blob:Blob):Promise<Paragraph>{
 if(!/^image\/(png|jpeg|webp)$/.test(blob.type))throw Error('지원하지 않는 이미지 형식입니다.');
 const bitmap=await createImageBitmap(blob);
 try{
  const ratio=Math.min(1,480/bitmap.width,640/bitmap.height);
  const width=Math.max(1,Math.round(bitmap.width*ratio));
  const height=Math.max(1,Math.round(bitmap.height*ratio));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('이미지 변환을 사용할 수 없습니다.');
  ctx.drawImage(bitmap,0,0,width,height);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG 변환 실패')),'image/png'));
  return new Paragraph({children:[new ImageRun({type:'png',data:new Uint8Array(await png.arrayBuffer()),transformation:{width,height}})]});
 }finally{bitmap.close();}
}
export function externalFileNotice(name:string):Paragraph{
 return new Paragraph({children:[new TextRun('[첨부파일 별도 전달 필요: '+name+']')]});
}
