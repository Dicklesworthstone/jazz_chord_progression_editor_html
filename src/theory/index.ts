export {
  ACCIDENTAL_STYLES,
  CHART_ERROR_CODES,
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  CHART_WARNING_CODES,
  CHORD_SYMBOL_SUGGESTION_POLICY_ID,
  CHORD_SYMBOL_SUGGESTION_POLICY_VERSION,
  CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
  CHORD_SYMBOL_GRAMMAR_ID,
  CHORD_SYMBOL_GRAMMAR_VERSION,
  MAX_CHART_EVENTS,
  MAX_CHART_MEASURES_PER_SECTION,
  MAX_CHART_SECTIONS,
  MAX_CHART_TOKENS,
  MAX_CHART_UTF8_BYTES,
  MAX_DID_YOU_MEAN,
  MAX_SUGGESTION_COMPARISONS,
  MAX_SYMBOL_CODE_POINTS,
  MAX_SYMBOL_MODIFIERS,
  MAX_SYMBOL_TOKENS,
  SYMBOL_ERROR_CODES,
  SYNTAX_CONTRACT_SCHEMA,
} from "./syntax-contract";

export type {
  AccidentalStyle,
  ChartDiagnostic,
  ChartDraftEvent,
  ChartDraftMeasure,
  ChartDraftSection,
  ChartErrorCode,
  ChartTextDraft,
  ChartTextErrorCode,
  ChartTextFormatResult,
  ChartTextHeaders,
  ChartTextParseRequest,
  ChartTextParseResult,
  ChartWarning,
  ChartWarningCode,
  ChordSymbolSuggestionReplacement,
  ChordSymbolFormatResult,
  ChordSymbolParseResult,
  FormatChartText,
  FormatChordSymbol,
  InsertableChartChord,
  InsertableChordDuration,
  ParseChartText,
  ParseChordSymbol,
  SourceRange,
  SymbolDiagnostic,
  SymbolErrorCode,
  SyntaxDiagnostic,
  SyntaxOperations,
} from "./syntax-contract";

export {
  ALTERED_DOMINANT_REALIZATION_IDS,
  CHORD_FORMULA_PHASES,
  CHORD_FORMULA_RULE_IDS,
  CHORD_FORMULA_TABLE_ID,
  CHORD_FORMULA_TABLE_VERSION,
  CUSTOM_REALIZATION_ID,
  CUSTOM_REALIZATION_LIMITATIONS,
  DEGREE_ROLE_POLICY_ID,
  DEGREE_ROLE_POLICY_VERSION,
  DEGREE_SPELLING_POLICY_ID,
  DEGREE_SPELLING_POLICY_VERSION,
  MAX_CUSTOM_CHORD_PITCHES,
  MAX_DEGREE_SPELLING_ALTERATION,
  MAX_THEORY_ADDITIONS,
  MAX_THEORY_ALTERATIONS,
  MAX_THEORY_CANDIDATE_INSERTIONS,
  MAX_THEORY_DEGREES_PER_REALIZATION,
  MAX_THEORY_EXTENSIONS,
  MAX_THEORY_FORMULA_PHASES,
  MAX_THEORY_FORMULA_PHASE_TRANSITIONS,
  MAX_THEORY_INPUT_DEGREE_RECORDS_VISITED,
  MAX_THEORY_PEAK_CANDIDATE_DEGREE_RECORDS,
  MAX_THEORY_REALIZATIONS,
  MAX_THEORY_OMISSIONS,
  MAX_THEORY_SEMANTIC_OUTPUT_RECORDS,
  MAX_THEORY_SPELLING_ATTEMPTS,
  MAX_THEORY_TRACKED_RECORDS,
  MAX_THEORY_WARNINGS,
  MIN_DEGREE_SPELLING_ALTERATION,
  RESOLUTION_CONTRACT_SCHEMA,
  RESOLUTION_OPERATION_NAMES,
  RESOLVED_CHORD_SCHEMA,
  SEMANTIC_REALIZATION_IDS,
  THEORY_ADDITION_NUMBERS,
  THEORY_ALTERATION_NUMBERS,
  THEORY_EXTENSION_NUMBERS,
  THEORY_MODIFIER_ALTERATIONS,
  THEORY_MODIFIER_CONFLICT_PRECEDENCE,
  THEORY_OMISSION_NUMBERS,
  THEORY_REFUSAL_CODES,
  THEORY_REFUSAL_PRECEDENCE,
  THEORY_REFUSAL_REASON_PRECEDENCE,
  THEORY_WARNING_CODES,
} from "./resolution-contract";

export type {
  AdditionInvalidRefusal,
  AlterationInvalidRefusal,
  AlteredDominantRealizationId,
  AlteredDominantRealizationTuple,
  AlteredDominantSemanticRealization,
  ChordFormulaPhase,
  ChordFormulaRuleId,
  ColorPolicyInvalidRefusal,
  CustomRealization,
  CustomRealizationLimitation,
  CustomResolveChordResult,
  CustomResolvedChord,
  CustomChordSpecWithPitches,
  DegreeSpelling,
  DegreeSpellingResult,
  ExtensionInvalidRefusal,
  FormulaRuleForSemanticRealization,
  FormulaFamilyUnsupportedRefusal,
  IndexAlignedTuple,
  LiteralFormulaRuleId,
  LiteralRealizationTuple,
  LiteralSemanticRealization,
  ModifierConflictRefusal,
  NonEmptyChordDegreeTuple,
  NonEmptySpelledPitchClassTuple,
  OmissionInvalidRefusal,
  ParsedResolvedChord,
  ParsedChordFormulaRuleId,
  ParsedResolveChordResult,
  ResolutionOperationName,
  ResolutionOperations,
  ResolveChord,
  ResolveChordResult,
  ResolvedChord,
  ResolvedChordMetadata,
  SemanticRealization,
  SemanticRealizationId,
  SixthInvalidRefusal,
  SpellChordDegree,
  SpellingAccidentalOutOfRangeRefusal,
  TheoryFormulaRefusal,
  TheoryModifierConflict,
  TheoryOutputLimitRefusal,
  TheoryRealizationDegreesExceededRefusal,
  TheoryRefusalCode,
  TheoryResolutionRefusal,
  TheorySpellingRefusal,
  TheoryWarning,
  TheoryWarningCode,
  TheoryWarnings,
} from "./resolution-contract";

export { formatChordSymbol, parseChordSymbol } from "./chord-symbol";
export { parseChartText } from "./chart-parser";
export { formatChartText } from "./chart-formatter";
export { syntaxOperations } from "./operations";
export { spellChordDegree } from "./degree-spelling";
export { resolveChord } from "./chord-resolution";
export { resolutionOperations } from "./resolution-operations";

export * from "./analysis-contract";
export * from "./chord-scales-contract";
export { deriveLiteralFacts } from "./analysis";

export * from "./voicing-candidates-contract";
export {
  VOICING_QUALITY_CLASSIFICATION,
  VOICING_REGISTER_POLICIES,
  VOICING_TEMPLATE_ROWS,
  classifyVoicingQuality,
  findVoicingFamilyTemplate,
  findVoicingRegisterPolicy,
  getVoicingFamilyPlan,
  getVoicingIdentityDegrees,
} from "./voicing-family-authority";
export type { VoicingFamilyPlan } from "./voicing-family-authority";
export { realizeVoicing } from "./voicing-candidates";
export { voicingCandidateOperations } from "./voicing-operations";

export * from "./voice-assignment-contract";
export {
  assignVoiceTransition,
  initializeVoiceFrame,
} from "./voice-assignment";

export * from "./progression-optimizer-contract";
export {
  advanceProgressionOptimization,
  cancelProgressionOptimization,
  initializeProgressionOptimization,
  progressionOptimizerOperations,
} from "./progression-optimizer";

/*
 * The one barrel publication of the continuation-contract surface. A second
 * path (a g2-contract wildcard) tripped SOURCE_DUPLICATE_EXPORT with 28
 * findings on 2026-09-03; if g2-contract returns to this barrel, it must
 * not wildcard continuation-contract again.
 */
export * from "./continuation-contract";
export { deriveContinuationSuggestions } from "./continuation";
export {
  continuationOperations,
  type ContinuationOperations,
} from "./continuation-operations";

export * from "./chart-analysis-contract";
export {
  analyzeChartEvent,
  deriveChordDetail,
  detectChartPhrases,
} from "./chart-analysis";
export {
  chartAnalysisOperations,
  type ChartAnalysisOperations,
} from "./chart-analysis-operations";

export * from "./g6-contract";
export {
  extractEventGuideTones,
  classifyGuideToneMotion,
  optimizeGuideTonePaths,
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";
export { deriveContextualColor } from "./color-lab";
export { g6Operations, type G6Operations } from "./g6-operations";

export * from "./h1-contract";
export {
  TRANSFORM_LAWS,
  getTransformLaw,
  listTransformLaws,
  evaluateTransformCandidates,
} from "./transform-laws";
export {
  makeSpelledInterval,
  invertInterval,
  transposePitchByInterval,
  transposeChordSymbolByInterval,
  transposeProgressionByInterval,
} from "./spelled-transposition";
export { h1Operations, type H1Operations } from "./h1-operations";

export * from "./g0-contract";
export { detectCadence } from "./phrase-cadence";
export { analyzeTonalJourney } from "./tonal-journey";
export { g0Operations, type G0Operations } from "./g0-operations";

export * from "./g1-contract";
export {
  sha256Sync,
  computeFingerprints,
  compileAtlasCorpus,
} from "./atlas-compiler";
export { makeAtlasQueryAdapter } from "./atlas-query";
export { g1Operations, type G1Operations } from "./g1-operations";

export { generateContextualContinuations } from "./contextual-continuation";
export { g2Operations, type G2Operations } from "./g2-operations";

export * from "./g3-contract";
export { planHarmonicRoutes } from "./route-planner";
export { g3Operations, type G3Operations } from "./g3-operations";

export * from "./g4-contract";
export { harmonizeConstraints } from "./harmonization-workbench";
export { g4Operations, type G4Operations } from "./g4-operations";

export * from "./g5-contract";
export {
  buildReharmonizationTree,
  compareReharmonizationBranches,
} from "./reharmonization-tree";
export { g5Operations, type G5Operations } from "./g5-operations";

export * from "./g7-contract";
export {
  computeTensionCurve,
  applyRhythmTransform,
} from "./rhythm-transforms";
export { g7Operations, type G7Operations } from "./g7-operations";

export * from "./g8-contract";
export {
  applyNeoRiemannianTransform,
  generateHarmonicSequence,
} from "./nonfunctional-transforms";
export { g8Operations, type G8Operations } from "./g8-operations";

export * from "./g9-contract";
export {
  createPracticeSession,
  gradePracticeSubmission,
} from "./practice-laboratory";
export { g9Operations, type G9Operations } from "./g9-operations";
