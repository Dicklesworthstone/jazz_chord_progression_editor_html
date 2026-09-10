import type {ValidatedDocument} from "../domain";
import {PRINT_FONT_ADVANCES,PRINT_FONT_DATA,PRINT_FONT_LICENSE} from "./print-font";
export type PrintPaper="a4"|"letter";
export type PrintText=Readonly<{x:number;y:number;size:3|4|6;text:string;sourceId:string}>;
export type PrintBox=Readonly<{x:number;y:number;width:number;height:number;sourceId:string}>;
export type PrintPage=Readonly<{width:number;height:number;texts:readonly PrintText[];boxes:readonly PrintBox[]}>;
export type PrintEvidence=Readonly<{sections:number;bars:number;events:number;codePoints:number;lines:number;rows:number;pages:number;termination:"complete"|"refused"}>;
export type PrintableChart=Readonly<{ok:true;paper:PrintPaper;pages:readonly PrintPage[];evidence:PrintEvidence}>|Readonly<{ok:false;message:string;evidence:PrintEvidence}>;
export function printTextWidth(text:string,size:number):number{
 let width=0;for(const char of text){const code=char.codePointAt(0),advance=code===undefined||code===173?undefined:PRINT_FONT_ADVANCES[String(code)];if(advance===undefined)throw new Error(`Unsupported print character U+${(code??0).toString(16).toUpperCase().padStart(4,"0")}.`);width+=advance*size;}return width;
}
export function wrapPrintText(text:string,width:number):readonly string[]{
 const lines:string[]=[];let line="",used=0;
 for(const char of text){const next=printTextWidth(char,4);if(next>width)throw new Error("A glyph is wider than its print cell.");if(used+next>width){lines.push(line);line="";used=0;}line+=char;used+=next;}lines.push(line);return Object.freeze(lines);
}
export function layoutPrintableChart(document:ValidatedDocument,paper:PrintPaper):PrintableChart{
 const work={sections:0,bars:0,events:0,codePoints:0,lines:0,rows:0,pages:0};
 const refuse=(message:string):PrintableChart=>Object.freeze({ok:false,message,evidence:Object.freeze({...work,termination:"refused"})});
 const width=paper==="a4"?210:215.9,height=paper==="a4"?297:279.4,column=(width-24)/4,bottom=height-12;
 const inspect=(text:string,field:string):void=>{let count=0;for(const char of text){count++;work.codePoints++;if(count>512||work.codePoints>16384)throw new Error(`${field}: print text limit exceeded.`);try{printTextWidth(char,4);}catch(error){throw new Error(`${field}: ${error instanceof Error?error.message:"Unsupported character."}`,{cause:error});}}};
 try{
  if(document.sections.length<1||document.sections.length>64)return refuse("Print supports 1–64 sections.");
  inspect(document.title,"Title");if(printTextWidth(document.title,6)>width-26)return refuse("Title is too wide for a single print line.");
  for(const section of document.sections){if(section.measures.length===0)return refuse(`Section ${section.id} has no bars to print.`);work.sections++;inspect(section.name,`Section ${section.id}`);if(printTextWidth(section.name,4)>width-26)return refuse(`Section ${section.id}: heading is too wide.`);
   for(const measure of section.measures){work.bars++;if(work.bars>256)return refuse("Print supports at most 256 bars.");for(const event of measure.events){work.events++;if(work.events>1024)return refuse("Print supports at most 1024 chords.");inspect(event.chord.sourceText,`Chord ${event.id}`);}}
  }
  if(work.bars===0)return refuse("There are no bars to print.");
  const pages:{width:number;height:number;texts:PrintText[];boxes:PrintBox[]}[]=[];let page:{width:number;height:number;texts:PrintText[];boxes:PrintBox[]}|null=null,y=30,barNumber=0;
  const addPage=():{width:number;height:number;texts:PrintText[];boxes:PrintBox[]}=>{if(pages.length>=32)throw new Error("Print exceeds 32 pages.");page={width,height,texts:[{x:12,y:18,size:6,text:document.title,sourceId:document.id},{x:12,y:25,size:3,text:`Tempo ${String(document.tempoBpm)} | ${String(document.meter.beatsPerBar)}/${String(document.meter.beatUnit)}`,sourceId:document.id}],boxes:[]};pages.push(page);work.pages=pages.length;y=30;return page;};
  const text=(value:PrintText):void=>{if(page===null)throw new Error("No page.");page.texts.push(Object.freeze(value));};
  for(const section of document.sections){let headingPending=true;
   for(let offset=0;offset<section.measures.length;offset+=4){
    const row=section.measures.slice(offset,offset+4).map(measure=>{
     const lines:string[]=[];
     if(measure.events.length===0)lines.push(`Rest ${String(document.meter.beatsPerBar*4)}/${String(document.meter.beatUnit)} q`);
     for(const event of measure.events){const duration=event.duration;lines.push(...wrapPrintText(`${event.chord.sourceText} [${String(duration.numerator)}/${String(duration.denominator)} q]`,column-7));}
     work.lines+=lines.length;if(work.lines>4096)throw new Error("Print exceeds 4096 lines.");return{measure,lines,height:Math.max(20,9+lines.length*5.2)};
    });
    const rowHeight=Math.max(...row.map(cell=>cell.height));if(rowHeight+10>bottom-30)throw new Error(`Bar ${row.find(cell=>cell.height===rowHeight)?.measure.id??""} is too tall for a page.`);
    if(page===null||y+rowHeight+(headingPending?10:0)>bottom){page=addPage();headingPending=true;}
    if(headingPending){text({x:12,y:y+6,size:4,text:section.name,sourceId:section.id});y+=10;headingPending=false;}
    for(let i=0;i<row.length;i++){const cell=row[i];if(cell===undefined)throw new Error("Invalid print row.");const x=12+i*column;barNumber++;page.boxes.push(Object.freeze({x,y,width:column,height:rowHeight,sourceId:cell.measure.id}));
     text({x:x+3,y:y+6,size:3,text:`${String(barNumber)}. ${cell.measure.completion.kind}`,sourceId:cell.measure.id});
     for(let line=0;line<cell.lines.length;line++)text({x:x+3,y:y+11.2+line*5.2,size:4,text:cell.lines[line]??"",sourceId:cell.measure.id});
    }y+=rowHeight;work.rows++;
   }
  }
  for(let i=0;i<pages.length;i++){const current=pages[i];if(current===undefined)throw new Error("Missing page.");current.texts.push(Object.freeze({x:12,y:height-5,size:3,text:`${String(i+1)} / ${String(pages.length)}`,sourceId:document.id}));}
  return Object.freeze({ok:true,paper,pages:Object.freeze(pages.map(p=>Object.freeze({...p,texts:Object.freeze(p.texts),boxes:Object.freeze(p.boxes)}))),evidence:Object.freeze({...work,termination:"complete"})});
 }catch(error){return refuse(error instanceof Error?error.message:"The print chart could not be laid out.");}
}
export function escapePrintXml(text:string):string{return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
export function encodePrintSvg(page:PrintPage):Readonly<{ok:true;bytes:Uint8Array<ArrayBuffer>}>|Readonly<{ok:false;message:string}>{
 const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${String(page.width)}mm" height="${String(page.height)}mm" viewBox="0 0 ${String(page.width)} ${String(page.height)}"><title>Changes chord chart</title><metadata>${escapePrintXml(PRINT_FONT_LICENSE)}</metadata><style>@font-face{font-family:ChangesPrint;src:url(${PRINT_FONT_DATA});font-weight:400}text{font-family:ChangesPrint;font-weight:400;font-kerning:none;font-variant-ligatures:none;white-space:pre;fill:#111}rect{fill:none;stroke:#555;stroke-width:.2}</style><rect width="100%" height="100%" style="fill:white;stroke:none"/>`];
 for(const box of page.boxes)parts.push(`<rect x="${String(box.x)}" y="${String(box.y)}" width="${String(box.width)}" height="${String(box.height)}" data-source-id="${escapePrintXml(box.sourceId)}"/>`);
 for(const text of page.texts)parts.push(`<text x="${String(text.x)}" y="${String(text.y)}" font-size="${String(text.size)}" data-source-id="${escapePrintXml(text.sourceId)}">${escapePrintXml(text.text)}</text>`);
 parts.push("</svg>");const bytes=new TextEncoder().encode(parts.join(""));return bytes.length<=1048576?Object.freeze({ok:true,bytes}):Object.freeze({ok:false,message:"This SVG exceeds the 1 MiB page limit."});
}
