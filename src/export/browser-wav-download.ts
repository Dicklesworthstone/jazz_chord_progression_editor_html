export type WavDownloadReceipt=Readonly<{issued:boolean;objectUrlsCreated:number;objectUrlsRevoked:number;outstandingOwnedResources:number}>;
export type PrepareWavDownload=(bytes:Uint8Array<ArrayBuffer>,filename:string)=>()=>WavDownloadReceipt;
/** Prepared Blob handoff, single-use and synchronous under the Download gesture. */
export const prepareBrowserWavDownload:PrepareWavDownload=(bytes,filename)=>{
  const blob=new Blob([bytes],{type:"audio/wav"});let used=false;
  return()=>{
    let anchorOutstanding=false,issued=false,objectUrlsCreated=0,objectUrlsRevoked=0,url:string|null=null,anchor:HTMLAnchorElement|null=null;
    if(used||!navigator.userActivation.isActive)return {issued,objectUrlsCreated,objectUrlsRevoked,outstandingOwnedResources:0};used=true;
    try{url=URL.createObjectURL(blob);objectUrlsCreated=1;anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.hidden=true;document.body.append(anchor);anchorOutstanding=true;anchor.click();issued=true;}
    catch{/* Preserve issued and cleanup accounting below. */}
    finally{try{anchor?.remove();anchorOutstanding=false;}catch{issued=false;}try{if(url!==null){URL.revokeObjectURL(url);objectUrlsRevoked=1;}}catch{/* Retain the outstanding URL count. */}}
    return Object.freeze({issued,objectUrlsCreated,objectUrlsRevoked,outstandingOwnedResources:objectUrlsCreated-objectUrlsRevoked+(anchorOutstanding?1:0)});
  };
};
