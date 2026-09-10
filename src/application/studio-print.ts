import type {ValidatedDocument} from "../domain";
import {layoutPrintableChart,encodePrintSvg,type PrintPage,type PrintPaper,type PrepareSvgDownload} from "../export";
export type {PrintPage,PrintPaper} from "../export";
export type StudioPrintView=Readonly<{state:"idle"|"preparing"|"ready"|"stale"|"refused";paper:PrintPaper;pages:readonly PrintPage[];pageIndex:number;canDownload:boolean;message:string}>;
export type StudioPrintService=Readonly<{read:()=>StudioPrintView;subscribe:(listener:()=>void)=>()=>void;prepare:()=>Promise<void>;close:()=>void;setPaper:(paper:PrintPaper)=>void;selectPage:(index:number)=>void;download:()=>void;print:()=>void}>;
export function createStudioPrint(ports:Readonly<{readDocument:()=>ValidatedDocument;readRevision:()=>number;subscribeSource:(listener:()=>void)=>()=>void;readyFont:()=>Promise<void>;nativePrint:()=>void;prepareDownload:PrepareSvgDownload}>):StudioPrintService{
 let state:StudioPrintView["state"]="idle",paper:PrintPaper="a4",pages:readonly PrintPage[]=[],pageIndex=0,message="Prepare a chord-only print preview.",generation=0;
 let binding:Readonly<{document:ValidatedDocument;revision:number}>|null=null,deliver:ReturnType<PrepareSvgDownload>|null=null;
 const listeners=new Set<()=>void>(),notify=():void=>{for(const listener of listeners)listener();},same=():boolean=>binding!==null&&binding.document===ports.readDocument()&&binding.revision===ports.readRevision();
 const read=():StudioPrintView=>Object.freeze({state,paper,pages,pageIndex,canDownload:deliver!==null,message});
 const clear=():void=>{generation++;pages=[];pageIndex=0;deliver=null;};
 const close=():void=>{clear();state="idle";message="Print preview closed.";notify();};
 const fail=(text:string):void=>{clear();state="refused";message=text;notify();};
 const preparePage=():void=>{const page=pages[pageIndex];if(page===undefined)throw new Error("Missing print page");const encoded=encodePrintSvg(page);if(!encoded.ok)throw new Error(encoded.message);deliver=ports.prepareDownload(encoded.bytes,`changes-${paper}-page-${String(pageIndex+1)}.svg`);};
 ports.subscribeSource(()=>{if(binding===null||same())return;clear();state="stale";message="The chart changed. Prepare a current print preview.";notify();});
 return Object.freeze({read,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},close,
  setPaper:(value:PrintPaper)=>{close();paper=value;message="Paper changed. Prepare its layout.";notify();},
  prepare:async()=>{clear();const token=generation,document=ports.readDocument();binding={document,revision:ports.readRevision()};state="preparing";message="Preparing bundled font and exact pages…";notify();try{await ports.readyFont();if(token!==generation||!same())return;const layout=layoutPrintableChart(document,paper);if(!layout.ok){fail(layout.message);return;}pages=layout.pages;preparePage();state="ready";message=`${String(pages.length)} page${pages.length===1?"":"s"} ready. Print at 100% with browser headers/footers off.`;notify();}catch(error){if(token===generation)fail(error instanceof Error?error.message:"Print preparation failed.");}},
  selectPage:(index:number)=>{if(state!=="ready"||!same()||!Number.isInteger(index)||index<0||index>=pages.length)return;try{pageIndex=index;preparePage();notify();}catch{fail("The page download could not be prepared.");}},
  download:()=>{if(state!=="ready"||!same()||deliver===null)return;const handoff=deliver;deliver=null;try{const r=handoff();if(!r.issued||r.created!==1||r.revoked!==1||r.outstanding!==0){fail("SVG download or cleanup could not be confirmed.");return;}message="SVG handed to browser downloads. Prepare again for another copy.";notify();}catch{fail("SVG download failed. Prepare again.");}},
  print:()=>{if(state!=="ready"||!same())return;try{ports.nativePrint();message="Print dialog opened. Check paper, scale and margins before printing.";notify();}catch{message="The browser could not open printing. Download the SVG instead.";notify();}},
 });
}
