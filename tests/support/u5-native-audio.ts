import type { Page } from "@playwright/test";

type NativeSourceCounts = Readonly<{ started: number; sounding: number; futureAttacks: number }>;
declare global { interface Window { u5NativeSourceCounts?: () => NativeSourceCounts } }
export async function observeNativeSources(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sources = new Map<AudioScheduledSourceNode, { start: number; stop: number | null; ended: boolean }>();
    const record = (source: AudioScheduledSourceNode, when: number) => {
      const row = { start: when, stop: null, ended: false };
      sources.set(source, row);
      source.addEventListener("ended", () => { row.ended = true; }, { once: true });
    };
    const captureMethod = (prototype: object, name: string) => {
      const method: unknown = Reflect.get(prototype, name);
      if (typeof method !== "function") throw new Error(`NATIVE_AUDIO_METHOD_MISSING:${name}`);
      return (receiver: AudioScheduledSourceNode, args: readonly number[]) => { Reflect.apply(method, receiver, args); };
    };
    const bufferStart = captureMethod(AudioBufferSourceNode.prototype, "start");
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      bufferStart(this, duration === undefined ? [when, offset] : [when, offset, duration]);
      record(this, when);
    };
    const oscillatorStart = captureMethod(OscillatorNode.prototype, "start");
    OscillatorNode.prototype.start = function (when = 0) { oscillatorStart(this, [when]); record(this, when); };
    for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
      const stop = captureMethod(prototype, "stop");
      prototype.stop = function (when = 0) {
        stop(this, [when]);
        const row = sources.get(this);
        if (row !== undefined) row.stop = when;
      };
    }
    window.u5NativeSourceCounts = () => {
      let sounding = 0; let futureAttacks = 0;
      for (const [source, row] of sources) {
        if (row.ended) continue;
        const now = source.context.currentTime;
        if (row.start <= now && (row.stop === null || row.stop > now)) sounding++;
        if (row.start > now && (row.stop === null || row.stop > row.start)) futureAttacks++;
      }
      return { started: sources.size, sounding, futureAttacks };
    };
  });
}
export async function failNextRetirementClockRead(page: Page, buttonId: string): Promise<void> {
  await page.evaluate(id => {
    const originalClock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "currentTime");
    const confirm = document.getElementById(id);
    if (originalClock?.get === undefined || !(confirm instanceof HTMLButtonElement)) throw new Error("NATIVE_CLOCK_OR_CONFIRM_MISSING");
    // Arm at the real scheduler cancellation so unrelated display reads cannot
    // consume the fault. Only one native clock read fails; every receipt is real.
    const originalClear = window.clearInterval;
    window.clearInterval = handle => {
      Reflect.apply(originalClear, window, [handle]);
      window.clearInterval = originalClear;
      Object.defineProperty(BaseAudioContext.prototype, "currentTime", { ...originalClock, get() {
        Object.defineProperty(BaseAudioContext.prototype, "currentTime", originalClock);
        return Number.NaN;
      } });
    };
    confirm.click();
  }, buttonId);
}
