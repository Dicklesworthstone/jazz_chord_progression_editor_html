/**
 * Narrow production UI entry point.
 *
 * The broad `src/ui/index.ts` surface also exposes reviewed contract data for
 * tests and development tools. The composition root imports this module so
 * that test-gallery inventories cannot enter the release module graph through
 * barrel initialization.
 */
export { App, StudioStartupFailure } from "./App";
export type {
  AppActions,
  AppProps,
  StudioStartupFailureProps,
} from "./App";
