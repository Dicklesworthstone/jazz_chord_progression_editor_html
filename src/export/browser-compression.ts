export type BoundedCompressionPort=(bytes:Uint8Array,outputLimit:number,signal?:AbortSignal)=>Promise<Uint8Array>;
async function transform(bytes:Uint8Array,limit:number,inflate:boolean,signal?:AbortSignal):Promise<Uint8Array>{
 if(bytes.length===0||bytes.length>(inflate?880:6138)||!Number.isInteger(limit)||limit<1||limit>(inflate?6138:880))throw new Error("Compression bounds exceeded");
 const canceled=():boolean=>signal?.aborted===true;
 if(canceled())throw new Error("Compression canceled");
 const stream=new Blob([bytes.slice()]).stream().pipeThrough(inflate?new DecompressionStream("deflate"):new CompressionStream("deflate"));
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;
 const abort=():void=>{void reader.cancel().catch(()=>undefined);};
 signal?.addEventListener("abort",abort,{once:true});
 try{
  for(;;){const next=await reader.read();if(canceled())throw new Error("Compression canceled");if(next.done)break;
   if(total+next.value.length>limit)throw new Error("Compression output limit exceeded");chunks.push(next.value);total+=next.value.length;
  }
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
 }finally{signal?.removeEventListener("abort",abort);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export const compressBrowserBytes:BoundedCompressionPort=(bytes,limit,signal)=>transform(bytes,limit,false,signal);
export const inflateBrowserBytes:BoundedCompressionPort=(bytes,limit,signal)=>transform(bytes,limit,true,signal);
