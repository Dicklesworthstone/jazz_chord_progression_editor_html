import type {ChordSpec} from "../domain";
import {parseChordSymbol} from "./chord-symbol";
export type GridEvent=Readonly<{chord:ChordSpec;quarters:number}>;
export type GridEvidence=Readonly<{bytes:number;lines:number;tokens:number;symbols:number;bars:number;events:number;termination:"complete"|"refused"}>;
export type ChordProGrid=Readonly<{title:string;tempo:number|null;comments:number;bars:readonly (readonly GridEvent[])[]}>;
export type GridResult=Readonly<{ok:true;grid:ChordProGrid;evidence:GridEvidence}>|Readonly<{ok:false;line:number;message:string;evidence:GridEvidence}>;
const pointCount=(text:string):number=>{let count=0;for(const point of text){if(point.length>0)count++;}return count;};
/** Closed ChordPro layout subset. Quarter-cell timing is an acknowledged import policy. */
export function decodeChordProGrid(source:string):GridResult {
 const work={bytes:0,lines:0,tokens:0,symbols:0,bars:0,events:0};
 const refuse=(message:string):GridResult=>Object.freeze({ok:false,line:work.lines,message,evidence:Object.freeze({...work,termination:"refused"})});
 if(source.length>16384)return refuse("Use a songbook file of at most 16,384 bytes.");
 work.bytes=new TextEncoder().encode(source).length;if(work.bytes>16384)return refuse("Use a songbook file of at most 16,384 bytes.");
 const lines=source.replace(/^\uFEFF/u,"").split(/\r?\n/u);if(lines.length>512)return refuse("Use at most 512 lines.");
 const bars:(readonly GridEvent[])[]=[];
 let title:string|null=null,tempo:number|null=null,time=false,phase:"header"|"grid"|"done"="header",shape=16,comments=0;
 for(const raw of lines){
  work.lines++;
  if(raw.length>1024)return refuse("A line exceeds 1,024 characters.");
  for(const point of raw){const code=point.codePointAt(0)??0;if((code<32&&code!==9)||code===127||(code>=0xd800&&code<=0xdfff))return refuse("Control characters and invalid Unicode are not supported.");}
  const line=raw.trim();if(line==="")continue;if(line.startsWith("#")){comments++;continue;}
  if(line.startsWith("{")){
   const header=/^\{(title|t|time|tempo):\s*(.*?)\}$/u.exec(line);
   if(header!==null){
    if(phase!=="header")return refuse("Metadata must appear once, before the grid; song or tempo changes are not supported.");
    const key=header[1],value=header[2]??"";
    if(key==="title"||key==="t"){
     if(title!==null||value.length===0||pointCount(value)>256||/[\t{}]/u.test(value))return refuse("Provide one title of 1–256 characters without braces or controls.");
     title=value;
    }else if(key==="time"){
     if(time||value!=="4/4")return refuse("Provide one explicit {time: 4/4} before the grid.");time=true;
    }else{
     if(tempo!==null||!/^\d{2,3}$/u.test(value)||Number(value)<20||Number(value)>400)return refuse("Provide at most one integer tempo from 20 to 400.");tempo=Number(value);
    }
    continue;
   }
   const start=/^\{(?:start_of_grid|sog)(?:(?::\s*([0-9]+(?:x4)?))|(?:\s+shape="([0-9]+(?:x4)?)"))?\}$/u.exec(line);
   if(start!==null){
    if(phase!=="header"||title===null||!time)return refuse("One title and explicit 4/4 time must precede one grid.");
    const value=start[1]??start[2]??"16";shape=value.endsWith("x4")?Number(value.slice(0,-2))*4:Number(value);
    if(![4,8,12,16].includes(shape))return refuse("Supported grid shapes are 4, 8, 12, 16 or 1x4 through 4x4.");
    phase="grid";continue;
   }
   if(/^\{(?:end_of_grid|eog)\}$/u.test(line)){
    if(phase!=="grid"||bars.length===0)return refuse("End one nonempty grid after its complete bars.");phase="done";continue;
   }
   return refuse("Unsupported directive. Lyrics, includes, configuration, extra metadata and grid properties are not imported.");
  }
  if(phase!=="grid")return refuse("Only one enclosed grid is supported; lyrics and additional songs are not imported.");
  const tokens=line.split(/\s+/u);work.tokens+=tokens.length;if(work.tokens>2048)return refuse("The grid exceeds 2,048 tokens.");
  const isBar=(value:string|undefined):boolean=>value==="|"||value==="||"||value==="|.";
  if(!isBar(tokens[0])||!isBar(tokens.at(-1)))return refuse("Use whitespace-separated cells enclosed by plain barlines; margin text is not supported.");
  if(tokens[0]==="|.")return refuse("A final barline belongs at the end of a line.");
  let cells:string[]=[],lineCells=0;
  for(let i=1;i<tokens.length;i++){
   const token=tokens[i];if(token===undefined)continue;
   if(!isBar(token)){cells.push(token);lineCells++;if(cells.length>4||lineCells>shape)return refuse("Each bar needs four cells and each line must fit its grid shape.");continue;}
   if(token==="|."&&i!==tokens.length-1)return refuse("A final barline belongs at the end of a line.");
   if(cells.length!==4)return refuse("Each bar needs exactly four cells.");
   if(bars.length>=128)return refuse("Repeat expansion exceeds 128 bars.");
   let events:GridEvent[]=[];
   if(cells[0]==="%"){
    const previous=bars.at(-1);
    if(previous===undefined||cells.slice(1).some(c=>c!=="."))return refuse("A single-bar repeat must be % . . . after a complete bar.");
    events=previous.map(e=>Object.freeze({...e}));
   }else{
    for(const cell of cells){
     if(cell==="."){
      const previous=events.at(-1);if(previous===undefined)return refuse("A leading empty cell has no unambiguous duration. Start the bar with a chord or slash.");
      events[events.length-1]=Object.freeze({...previous,quarters:previous.quarters+1});
     }else if(cell==="/"){
      const previous=events.at(-1)??bars.at(-1)?.at(-1);if(previous===undefined)return refuse("A slash needs a preceding chord.");
      events.push(Object.freeze({chord:previous.chord,quarters:1}));
     }else{
      if(pointCount(cell)>64||/[~%|]/u.test(cell))return refuse("Unsupported chord cell, subdivision or repeat notation.");
      work.symbols++;const parsed=parseChordSymbol(cell,"ascii");
      if(!parsed.ok)return refuse(`Unsupported chord symbol: ${cell}`);
      events.push(Object.freeze({chord:parsed.chord,quarters:1}));
     }
    }
   }
   if(work.events+events.length>512)return refuse("The expanded grid exceeds 512 chord events.");
   bars.push(Object.freeze(events));work.bars++;work.events+=events.length;cells=[];
  }
 }
 if(phase!=="done"||title===null)return refuse("Provide one complete titled grid ending with {end_of_grid}.");
 return Object.freeze({ok:true,grid:Object.freeze({title,tempo,comments,bars:Object.freeze(bars)}),evidence:Object.freeze({...work,termination:"complete"})});
}
