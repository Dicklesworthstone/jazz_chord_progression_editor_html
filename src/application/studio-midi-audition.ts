import { decodeDocumentShape, makeMeter, MIDI_PPQ } from "../domain";
import { MAX_TRANSPORT_PREVIEW_EVENTS, MAX_TRANSPORT_PREVIEW_BEATS } from "../audio";
import { M1_MAX_IMPORT_CHUNKS, M1_CHUNK_CODE_POINT_LIMIT } from "../export";
import { parseChartText } from "../theory";
import { compilePerformancePlan, PERFORMANCE_STYLE_IDS, type PlaybackPlan } from "../playback";
import { createStudioComposition, type StudioController } from "./studio-controller";
import { STUDIO_BLANK_DOCUMENT_IDS } from "./studio-bootstrap";
import { validateDocumentSemantics } from "./document-validation";
import { compileStudioPlaybackPlan } from "./studio-playback";
import type { StudioAudioGesture } from "./studio-audio";
import type { MidiImportPreview, StudioMidiImportService } from "./studio-midi-import";

export const MIDI_GROOVE_AUDITION_BARS = 4;
export type MidiGrooveAuditionResult =
  | Readonly<{ok:true;plan:PlaybackPlan;barCount:number}>
  | Readonly<{ok:false;code:string;message:string}>;

/** Import into an isolated real composition, then publish a bounded excerpt.
 * Random insertion IDs never escape: ephemeral identities are canonicalized
 * before realization, so identical retained imports produce identical plans.
 * The caller's document and adapters are never passed to this composition.
 */
export function compileMidiGrooveAudition(
  importer: Pick<StudioMidiImportService,"commitAutomatic">,
  preview: MidiImportPreview,
): MidiGrooveAuditionResult {
  const refuse = (code:string,message:string): MidiGrooveAuditionResult => Object.freeze({ok:false,code,message});
  const automation = preview.automation;
  if (automation === null) return refuse("m1.audition_unavailable","Choose a MIDI file with playable chords first.");
  const styleId = PERFORMANCE_STYLE_IDS.find(id => id === automation.groove.grooveStyleId);
  if (styleId === undefined) return refuse("m1.audition_groove_unknown","Choose a supported groove before auditioning.");
  const meter = makeMeter({beatsPerBar:automation.initialMeter.numerator,beatUnit:automation.initialMeter.beatUnit});
  if (!meter.ok || automation.chunkTexts.length > M1_MAX_IMPORT_CHUNKS)
    return refuse("m1.audition_limit","This import exceeds the audition limits.");
  // Parse only bounded M1 chunks until four bars have been extracted. This
  // avoids constructing a whole long chart and its undo history just to hear
  // its opening. T0 source ranges include the closing bar, so a prefix cut
  // preserves exact source spelling and escaped section names.
  let remainingBars = MIDI_GROOVE_AUDITION_BARS;
  const chunks: string[] = [];
  for (const chunk of automation.chunkTexts) {
    if (remainingBars === 0) break;
    if (chunk.length > 2 * M1_CHUNK_CODE_POINT_LIMIT) return refuse("m1.audition_limit","This import chunk exceeds the audition limit.");
    const parsed = parseChartText(chunk,{mode:"fragment",meter:meter.value},"ascii");
    if (!parsed.ok) return refuse("m1.audition_syntax","The pending excerpt could not be parsed.");
    let end = 0;
    for (const section of parsed.draft.sections) {
      for (const measure of section.measures) {
        if (remainingBars === 0) break;
        end = measure.range.end;
        remainingBars -= 1;
      }
      if (remainingBars === 0) break;
    }
    if (end > 0) chunks.push(chunk.slice(0,end));
  }
  const created = createStudioComposition();
  if (!created.ok) return refuse("m1.audition_document_failed","The audition chart could not be prepared.");
  const composition = created.composition;
  const committed = importer.commitAutomatic(composition.controller,Object.freeze({...preview,automation:Object.freeze({...automation,chunkTexts:Object.freeze(chunks)})}));
  if (!committed.committed) return refuse("m1.audition_import_refused","The pending import could not be prepared for audition. Your chart is unchanged.");
  const document = composition.readApplicationState().document;
  let barCount = 0;
  let eventOrdinal = 0;
  const sections = document.sections.flatMap((section,sectionIndex) => {
    if (section.id === STUDIO_BLANK_DOCUMENT_IDS.section && section.measures.every(m => m.events.length === 0)) return [];
    const measures = section.measures.slice(0,Math.max(0,MIDI_GROOVE_AUDITION_BARS-barCount)).map(measure => {
      barCount += 1;
      return {...measure,id:`m1-audition-measure-${String(barCount)}`,events:measure.events.map(event => {
        eventOrdinal += 1;
        return {...event,id:`m1-audition-event-${String(eventOrdinal)}`};
      })};
    });
    return measures.length === 0 ? [] : [{...section,id:`m1-audition-section-${String(sectionIndex)}`,measures}];
  });
  const decoded = decodeDocumentShape({...document,id:"m1-audition-document",sections});
  if (!decoded.ok) return refuse("m1.audition_shape_refused","The audition excerpt could not be validated.");
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) return refuse("m1.audition_document_refused","The audition excerpt contains an unsupported chord or duration.");
  const literal = compileStudioPlaybackPlan(published.value);
  if (!literal.ok) return refuse(literal.refusal.code,literal.refusal.message);
  const performed = compilePerformancePlan({plan:literal.plan,styleId,compContinuityVersion:2});
  if (!performed.ok || performed.plan.events.length === 0)
    return refuse("m1.audition_groove_refused","This groove cannot play the excerpt. Choose another groove; your chart is unchanged.");
  if (performed.plan.events.length > MAX_TRANSPORT_PREVIEW_EVENTS || performed.plan.totalTicks > MAX_TRANSPORT_PREVIEW_BEATS * MIDI_PPQ)
    return refuse("m1.audition_limit","The first bars exceed the audition limit. Add the chart to hear the full progression.");
  return Object.freeze({ok:true,plan:performed.plan,barCount});
}

export async function auditionMidiImportGroove(
  controller: StudioController,
  importer: StudioMidiImportService | null,
  preview: MidiImportPreview,
  gesture: StudioAudioGesture,
) {
  if (importer === null) return Object.freeze({ok:false as const,code:"m1.audition_unavailable",message:"MIDI import is unavailable."});
  const compiled = compileMidiGrooveAudition(importer,preview);
  if (!compiled.ok) return compiled;
  return controller.previewPlaybackPlan(compiled.plan,gesture);
}
