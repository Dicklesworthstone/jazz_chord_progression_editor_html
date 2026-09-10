export type SvgDownloadReceipt=Readonly<{issued:boolean;created:number;revoked:number;outstanding:number}>;
export type PrepareSvgDownload=(bytes:Uint8Array<ArrayBuffer>,filename:string)=>()=>SvgDownloadReceipt;
export const prepareBrowserSvgDownload:PrepareSvgDownload=(bytes,filename)=>{
 const blob=new Blob([bytes],{type:"image/svg+xml"});let used=false;
 return()=>{let issued=false,created=0,revoked=0,attached=false,url:string|null=null,anchor:HTMLAnchorElement|null=null;
  if(used||!navigator.userActivation.isActive)return {issued,created,revoked,outstanding:0};used=true;
  try{url=URL.createObjectURL(blob);created=1;anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.hidden=true;document.body.append(anchor);attached=true;anchor.click();issued=true;}
  catch{/* Report handoff/cleanup truth below. */}
  finally{try{anchor?.remove();attached=false;}catch{issued=false;}try{if(url!==null){URL.revokeObjectURL(url);revoked=1;}}catch{/* URL remains outstanding. */}}
  return Object.freeze({issued,created,revoked,outstanding:created-revoked+(attached?1:0)});
 };
};
export async function prepareBrowserPrintFont():Promise<void>{const fonts=await document.fonts.load("400 16px Archivo");if(fonts.length===0)throw new Error("Bundled print font unavailable");await document.fonts.ready;}
export function activateBrowserPrint():void{window.print();}
