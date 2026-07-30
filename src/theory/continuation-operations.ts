import { deriveContinuationSuggestions } from "./continuation";

/** Stable public operation table for dependency injection at application seams. */
export const continuationOperations = Object.freeze({
  deriveContinuationSuggestions,
});

export type ContinuationOperations = typeof continuationOperations;
