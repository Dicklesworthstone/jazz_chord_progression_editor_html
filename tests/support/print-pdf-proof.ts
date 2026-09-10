import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
/** Independent Poppler readers; missing tools fail rather than skipping native PDF proof. */
export function verifyNativePrintPdf(path:string,paper:"a4"|"letter"){
 const run=(tool:string,args:readonly string[]):string=>{try{return execFileSync(tool,[...args],{encoding:"utf8",timeout:10000});}catch(cause){throw new Error(`Native print proof requires working Poppler ${tool}. See docs/PRINTABLE_CHARTS.md.`,{cause});}};
 const info=run("pdfinfo",[path]),fonts=run("pdffonts",[path]),text=run("pdftotext",["-layout",path,"-"]),first=run("pdftotext",["-f","1","-l","1","-layout",path,"-"]);
 const pages=Number(/Pages:\s+(\d+)/.exec(info)?.[1]),dimensions=/Page size:\s+([\d.]+) x ([\d.]+)/.exec(info),width=Number(dimensions?.[1]),height=Number(dimensions?.[2]);
 const nominal=paper==="a4"?[210*72/25.4,297*72/25.4]:[612,792];
 if(pages!==2||!Number.isFinite(width)||!Number.isFinite(height)||Math.abs(width-(nominal[0]??0))>1||Math.abs(height-(nominal[1]??0))>1)throw new Error(`Native PDF geometry mismatch: ${info}`);
 const pageReport=run("pdfinfo",["-f","1","-l","2",path]);
 const pageSizes=[...pageReport.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/g)].map(match=>[Number(match[1]),Number(match[2])]);
 if(pageSizes.length!==2||pageSizes.some(size=>!Number.isFinite(size[0])||!Number.isFinite(size[1])||Math.abs((size[0]??0)-(nominal[0]??0))>1||Math.abs((size[1]??0)-(nominal[1]??0))>1))throw new Error(`A native PDF page has the wrong geometry: ${pageReport}`);
 const total=(text.match(/Dbmaj7\s+\[4\/1 q\]/g)??[]).length,firstCount=(first.match(/Dbmaj7\s+\[4\/1 q\]/g)??[]).length;
 if(total!==49||firstCount!==(paper==="a4"?48:44)||text.includes("Imported chart"))throw new Error(`Native PDF lost or added chart content: ${text}`);
 if(!fonts.includes("Archivo")||!/yes\s+yes\s+yes/.test(fonts))throw new Error(`Native PDF font is not embedded with Unicode mapping: ${fonts}`);
 return Object.freeze({pages,widthPt:width,heightPt:height,pageSizesPt:pageSizes,nominalPt:nominal,tolerancePt:1,exactDurations:total,firstPageDurations:firstCount,fonts,sha256:createHash("sha256").update(readFileSync(path)).digest("hex"),textSha256:createHash("sha256").update(text).digest("hex")});
}
