import {
  analyzeChartEvent,
  deriveChordDetail,
  detectChartPhrases,
} from "./chart-analysis";

/**
 * The chart-annotation engine's callable surface, frozen like the other
 * theory operation tables so consumers receive one immutable object and the
 * wiring stays inspectable at the composition boundary.
 */
export const chartAnalysisOperations = Object.freeze({
  analyzeChartEvent,
  detectChartPhrases,
  deriveChordDetail,
});

export type ChartAnalysisOperations = typeof chartAnalysisOperations;
