import {
  classifyGuideToneMotion,
  extractEventGuideTones,
  optimizeGuideTonePaths,
} from "./guide-tones";
import { deriveContextualColor } from "./color-lab";

export interface G6Operations {
  readonly extractEventGuideTones: typeof extractEventGuideTones;
  readonly classifyGuideToneMotion: typeof classifyGuideToneMotion;
  readonly optimizeGuideTonePaths: typeof optimizeGuideTonePaths;
  readonly deriveContextualColor: typeof deriveContextualColor;
}

export const g6Operations: G6Operations = Object.freeze({
  extractEventGuideTones,
  classifyGuideToneMotion,
  optimizeGuideTonePaths,
  deriveContextualColor,
});
