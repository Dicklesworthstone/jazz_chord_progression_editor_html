import { formatChartText } from "./chart-formatter";
import { parseChartText } from "./chart-parser";
import { formatChordSymbol, parseChordSymbol } from "./chord-symbol";
import type { SyntaxOperations } from "./syntax-contract";

/** The complete, immutable public T0 syntax operation surface. */
export const syntaxOperations: SyntaxOperations = Object.freeze({
  parseChordSymbol,
  formatChordSymbol,
  parseChartText,
  formatChartText,
});

