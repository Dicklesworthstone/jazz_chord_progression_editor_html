/*! @license
 * QR Code generator library (TypeScript)
 * 
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */

// Bounded byte-mode/M adaptation for Changes. No package/runtime dependency.
export type QrMatrix=Readonly<{version:number;size:number;mask:number;rows:readonly string[]}>;
export type QrWork=Readonly<{bytes:number;versionChecks:number;maskCandidates:number;moduleVisits:number;gfMultiplications:number;termination:"complete"|"refused"}>;
export type QrResult=Readonly<{ok:true;matrix:QrMatrix;work:QrWork}>|Readonly<{ok:false;message:string;work:QrWork}>;
const ECC=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28] as const;
const BLOCKS=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26] as const;
function rawModules(v:number):number{let n=(16*v+128)*v+64;if(v>=2){const a=Math.floor(v/7)+2;n-=(25*a-10)*a-55;if(v>=7)n-=36;}return n;}
export function qrByteCapacity(version:number):number{
 if(!Number.isInteger(version)||version<1||version>28)return 0;
 return (Math.floor(rawModules(version)/8)-(ECC[version]??0)*(BLOCKS[version]??0))-(version<10?2:3);
}
/** Options pin independent reference vectors; production callers use automatic version/mask. */
export function encodeQrAscii(text:string,options:Readonly<{version?:number;mask?:number}>={}):QrResult{
 const work={bytes:text.length,versionChecks:0,maskCandidates:0,moduleVisits:0,gfMultiplications:0};
 const refuse=(message:string):QrResult=>({ok:false,message,work:Object.freeze({...work,termination:"refused"})});
 if(text.length===0||text.length>1190)return refuse("QR supports 1–1,190 ASCII bytes. Use the exact link or JSON for this chart.");
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<32||c>126)return refuse("QR input must be printable ASCII.");}
 if(options.version!==undefined&&(!Number.isInteger(options.version)||options.version<1||options.version>28))return refuse("QR version is outside 1–28.");
 if(options.mask!==undefined&&(!Number.isInteger(options.mask)||options.mask<0||options.mask>7))return refuse("QR mask is outside 0–7.");
 let version=options.version??1;
 for(;version<=28;version++){work.versionChecks++;if(text.length<=qrByteCapacity(version))break;if(options.version!==undefined)return refuse("The requested QR version cannot hold the payload.");}
 if(version>28)return refuse("This chart exceeds the QR display budget. Use its exact link or JSON.");
 const n=17+version*4,ecc=ECC[version]??0,numBlocks=BLOCKS[version]??0,raw=Math.floor(rawModules(version)/8),dataBytes=raw-ecc*numBlocks;
 const data=new Uint8Array(dataBytes);let bitLength=0;
 const append=(value:number,count:number):void=>{for(let i=count-1;i>=0;i--){const at=bitLength>>>3;data[at]=(data[at]??0)|((value>>>i&1)<<(7-(bitLength&7)));bitLength++;}};
 append(4,4);append(text.length,version<10?8:16);for(let i=0;i<text.length;i++)append(text.charCodeAt(i),8);
 append(0,Math.min(4,dataBytes*8-bitLength));append(0,(8-bitLength%8)%8);
 for(let pad=0xec;bitLength<dataBytes*8;pad^=0xec^0x11)append(pad,8);
 const multiply=(x:number,y:number):number=>{work.gfMultiplications++;let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z;};
 const divisor=new Uint8Array(ecc);divisor[ecc-1]=1;let root=1;
 for(let i=0;i<ecc;i++){for(let j=0;j<ecc;j++)divisor[j]=multiply(divisor[j]??0,root)^(j+1<ecc?(divisor[j+1]??0):0);root=multiply(root,2);}
 const remainder=(bytes:Uint8Array):Uint8Array=>{const r=new Uint8Array(ecc);for(const byte of bytes){const factor=byte^(r[0]??0);r.copyWithin(0,1);r[ecc-1]=0;for(let j=0;j<ecc;j++)r[j]=(r[j]??0)^multiply(divisor[j]??0,factor);}return r;};
 const shortCount=numBlocks-raw%numBlocks,shortLength=Math.floor(raw/numBlocks),blocks:Uint8Array[]=[];let offset=0;
 for(let i=0;i<numBlocks;i++){const length=shortLength-ecc+(i<shortCount?0:1),chunk=data.slice(offset,offset+length);offset+=length;const block=new Uint8Array(shortLength+1);block.set(chunk);block.set(remainder(chunk),shortLength+1-ecc);blocks.push(block);}
 const words=new Uint8Array(raw);let wordIndex=0;
 for(let i=0;i<shortLength+1;i++)for(let j=0;j<numBlocks;j++)if(i!==shortLength-ecc||j>=shortCount)words[wordIndex++]=blocks[j]?.[i]??0;
 if(wordIndex!==raw||offset!==dataBytes)return refuse("QR block accounting failed.");
 const base=new Uint8Array(n*n),functions=new Uint8Array(n*n);
 const put=(buffer:Uint8Array,x:number,y:number,dark:number):void=>{buffer[y*n+x]=dark;functions[y*n+x]=1;work.moduleVisits++;};
 for(let i=0;i<n;i++){put(base,6,i,i%2===0?1:0);put(base,i,6,i%2===0?1:0);}
 for(const [cx,cy]of [[3,3],[n-4,3],[3,n-4]] as const)for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&y>=0&&x<n&&y<n)put(base,x,y,d!==2&&d!==4?1:0);}
 const align:number[]=[];if(version>1){const count=Math.floor(version/7)+2,step=Math.floor((version*8+count*3+5)/(count*4-4))*2;align.push(6);for(let p=n-7;align.length<count;p-=step)align.splice(1,0,p);}
 for(let i=0;i<align.length;i++)for(let j=0;j<align.length;j++)if(!(i===0&&j===0||i===0&&j===align.length-1||i===align.length-1&&j===0)){
  const x=align[i]??0,y=align[j]??0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)put(base,x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1?1:0);
 }
 const format=(buffer:Uint8Array,mask:number):void=>{
  let rem=mask;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);const bits=((mask<<10)|rem)^0x5412,bit=(i:number):number=>bits>>>i&1;
  for(let i=0;i<=5;i++)put(buffer,8,i,bit(i));put(buffer,8,7,bit(6));put(buffer,8,8,bit(7));put(buffer,7,8,bit(8));for(let i=9;i<15;i++)put(buffer,14-i,8,bit(i));
  for(let i=0;i<8;i++)put(buffer,n-1-i,8,bit(i));for(let i=8;i<15;i++)put(buffer,8,n-15+i,bit(i));put(buffer,8,n-8,1);
 };
 format(base,0);
 if(version>=7){let rem=version;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);const bits=version<<12|rem;for(let i=0;i<18;i++){const a=n-11+i%3,b=Math.floor(i/3),bit=bits>>>i&1;put(base,a,b,bit);put(base,b,a,bit);}}
 let bitIndex=0;
 for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let v=0;v<n;v++)for(let j=0;j<2;j++){const x=right-j,y=((right+1)&2)===0?n-1-v:v,index=y*n+x;work.moduleVisits++;if(functions[index]===0&&bitIndex<words.length*8){base[index]=(words[bitIndex>>>3]??0)>>>(7-(bitIndex&7))&1;bitIndex++;}}}
 if(bitIndex!==words.length*8)return refuse("QR placement accounting failed.");
 const invert=(mask:number,x:number,y:number):boolean=>{
  switch(mask){case 0:return(x+y)%2===0;case 1:return y%2===0;case 2:return x%3===0;case 3:return(x+y)%3===0;case 4:return(Math.floor(x/3)+Math.floor(y/2))%2===0;case 5:return x*y%2+x*y%3===0;case 6:return(x*y%2+x*y%3)%2===0;default:return((x+y)%2+x*y%3)%2===0;}
 };
 const penalty=(matrix:Uint8Array):number=>{
  const get=(x:number,y:number):number=>{work.moduleVisits++;return matrix[y*n+x]??0;};let score=0,dark=0;
  for(let axis=0;axis<2;axis++)for(let outer=0;outer<n;outer++){
   const history=[0,0,0,0,0,0,0];let color=0,run=0;
   const add=(length:number):void=>{if(history[0]===0)length+=n;history.pop();history.unshift(length);};
   const patterns=():number=>{const unit=history[1]??0,core=unit>0&&history[2]===unit&&history[3]===unit*3&&history[4]===unit&&history[5]===unit;return(core&&(history[0]??0)>=unit*4&&(history[6]??0)>=unit?1:0)+(core&&(history[6]??0)>=unit*4&&(history[0]??0)>=unit?1:0);};
   for(let inner=0;inner<n;inner++){const value=axis===0?get(inner,outer):get(outer,inner);if(value===color){run++;if(run===5)score+=3;else if(run>5)score++;}else{add(run);if(color===0)score+=patterns()*40;color=value;run=1;}}
   if(color===1){add(run);run=0;}add(run+n);score+=patterns()*40;
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const value=get(x,y);dark+=value;if(x+1<n&&y+1<n&&value===get(x+1,y)&&value===get(x,y+1)&&value===get(x+1,y+1))score+=3;}
  score+=(Math.ceil(Math.abs(dark*20-n*n*10)/(n*n))-1)*10;return score;
 };
 let best=base,bestMask=0,bestScore=Infinity;
 for(let mask=options.mask??0;mask<=(options.mask??7);mask++){
  work.maskCandidates++;const candidate=base.slice();for(let y=0;y<n;y++)for(let x=0;x<n;x++){const index=y*n+x;work.moduleVisits++;if(functions[index]===0&&invert(mask,x,y))candidate[index]=(candidate[index]??0)^1;}
  format(candidate,mask);const score=penalty(candidate);if(score<bestScore){bestScore=score;best=candidate;bestMask=mask;}
 }
 const rows:string[]=[];for(let y=0;y<n;y++){let row="";for(let x=0;x<n;x++){work.moduleVisits++;row+=String(best[y*n+x]??0);}rows.push(row);}
 return Object.freeze({ok:true,matrix:Object.freeze({version,size:n,mask:bestMask,rows:Object.freeze(rows)}),work:Object.freeze({...work,termination:"complete"})});
}
/** Numeric path commands only; caller supplies the mandatory four-module white border. */
export function qrModulePath(matrix:QrMatrix):string{
 const parts:string[]=[];for(let y=0;y<matrix.size;y++){const row=matrix.rows[y]??"";for(let x=0;x<matrix.size;){if(row[x]!=="1"){x++;continue;}const first=x;while(row[x]==="1")x++;parts.push(`M${String(first+4)} ${String(y+4)}h${String(x-first)}v1h-${String(x-first)}z`);}}return parts.join("");
}
