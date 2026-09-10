import {encodeQrAscii,qrModulePath,type QrMatrix,type QrWork,type BoundedCompressionPort} from "../export";
import {decodeSharedStartup,compactCanonicalShareDocument,exactShareUrl,MAX_EXACT_SHARE_BYTES,type SharedStartupPayload} from "./exact-share";
import type {ValidatedDocument} from "../domain";
import type {ShareResult} from "./studio-share";
export const QR_SHARE_PREFIX="#zdoc=3.";
export type ExactQr=Readonly<{url:string;matrix:QrMatrix;path:string;work:QrWork;jsonBytes:number;compressedBytes:number}>;
const encoded=(bytes:Uint8Array):string=>{let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");};
const invalid=():ShareResult<never>=>({ok:false,code:"share.encoding_invalid",message:"The compressed link could not be decoded exactly. Use a current app or ask for the ordinary exact link or JSON file."});
const tooLarge=():ShareResult<never>=>({ok:false,code:"share.limit_exceeded",message:"This chart is too large for the QR budget. Copy the exact link or download exact JSON."});
export async function encodeQrShareText(text:string,compress:BoundedCompressionPort,signal?:AbortSignal):Promise<ShareResult<Readonly<{fragment:string;jsonBytes:number;compressedBytes:number}>>>{
 if(text.length>MAX_EXACT_SHARE_BYTES)return tooLarge();const bytes=new TextEncoder().encode(text);
 if(bytes.length===0||bytes.length>MAX_EXACT_SHARE_BYTES)return tooLarge();
 try{const packed=await compress(bytes,880,signal);if(signal?.aborted===true)return invalid();if(packed.length===0||packed.length>880)return tooLarge();return{ok:true,value:{fragment:QR_SHARE_PREFIX+encoded(packed),jsonBytes:bytes.length,compressedBytes:packed.length}};}catch{return{ok:false,code:"share.encoding_invalid",message:"QR compression was unavailable or exceeded its small-chart budget. Copy the exact link or download exact JSON."};}
}
/** Decompressed text still requires the existing E0/F2/F3 publication boundary. */
export async function decodeSharedStartupWithQr(fragment:string,inflate:BoundedCompressionPort):Promise<ShareResult<SharedStartupPayload>>{
 if(!fragment.startsWith(QR_SHARE_PREFIX))return decodeSharedStartup(fragment);
 if(fragment.length>1182)return tooLarge();const payload=fragment.slice(QR_SHARE_PREFIX.length),remainder=payload.length%4;
 if(!/^[A-Za-z0-9_-]+$/u.test(payload)||remainder===1)return invalid();
 try{
  const binary=atob(payload.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-remainder)%4));if(binary.length>880)return tooLarge();
  const packed=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)packed[i]=binary.charCodeAt(i);if(encoded(packed)!==payload)return invalid();
  const bytes=await inflate(packed,MAX_EXACT_SHARE_BYTES);if(bytes.length===0||bytes.length>MAX_EXACT_SHARE_BYTES)return tooLarge();
  const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);return{ok:true,value:{version:2,text}};
 }catch{return invalid();}
}
export async function prepareExactQr(document:ValidatedDocument,location:string,compress:BoundedCompressionPort,signal?:AbortSignal):Promise<ShareResult<ExactQr>>{
 const packed=await encodeQrShareText(compactCanonicalShareDocument(document),compress,signal);if(!packed.ok)return packed;
 if(signal?.aborted===true)return invalid();const url=exactShareUrl(location,packed.value.fragment);if(url===null)return invalid();if(url.length>1190)return tooLarge();
 const result=encodeQrAscii(url);if(!result.ok)return tooLarge();return{ok:true,value:Object.freeze({url,matrix:result.matrix,path:qrModulePath(result.matrix),work:result.work,jsonBytes:packed.value.jsonBytes,compressedBytes:packed.value.compressedBytes})};
}
