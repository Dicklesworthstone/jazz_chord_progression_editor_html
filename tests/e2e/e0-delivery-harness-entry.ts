/**
 * Browser bundle entry for the E0 delivery e2e
 * (tests/e2e/e0-export-delivery.spec.ts). It exposes the REAL production
 * section-10 start primitive — bundled from src/export, never a copy — on
 * a window global so the spec can drive it from a genuine user gesture in
 * a real browser and validate the download bytes and cleanup receipt.
 */
import { startPreparedExportDelivery } from "../../src/export";

(globalThis as unknown as Record<string, unknown>)[
  "__e0StartPreparedExportDelivery"
] = startPreparedExportDelivery;
