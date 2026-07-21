import type {
  AudioRegistryIndexCounts,
  AudioRetirementSelector,
  AudioVoiceOwner,
} from "./audio-engine-contract";
import { sameAudioOwner, type SynthVoice } from "./synth-voice";

type TokenIndex = Map<string, Set<number>>;

function ownerKey(owner: AudioVoiceOwner): string {
  return owner.kind === "progression"
    ? `progression:${String(owner.generation)}`
    : `preview:${String(owner.generation)}:${owner.previewId}`;
}

function generationKey(
  ownerKind: AudioVoiceOwner["kind"],
  generation: number,
): string {
  return `${ownerKind}:${String(generation)}`;
}

function eventKey(owner: AudioVoiceOwner, eventId: string): string {
  return `${ownerKey(owner)}|${eventId}`;
}

function pitchKey(owner: AudioVoiceOwner, midiPitch: number): string {
  return `${ownerKey(owner)}|${String(midiPitch)}`;
}

function addReference(index: TokenIndex, key: string, token: number): void {
  const existing = index.get(key);
  if (existing !== undefined) {
    existing.add(token);
    return;
  }
  index.set(key, new Set([token]));
}

function deleteReference(index: TokenIndex, key: string, token: number): void {
  const existing = index.get(key);
  if (existing === undefined) return;
  existing.delete(token);
  if (existing.size === 0) index.delete(key);
}

function referenceCount(index: TokenIndex): number {
  let count = 0;
  for (const tokens of index.values()) count += tokens.size;
  return count;
}

export function compareSynthVoiceIdentity(
  left: SynthVoice,
  right: SynthVoice,
): number {
  if (left.voiceId < right.voiceId) return -1;
  if (left.voiceId > right.voiceId) return 1;
  return left.instanceToken - right.instanceToken;
}

export class ActiveVoiceRegistry {
  readonly #voices = new Map<number, SynthVoice>();
  readonly #voiceIndex: TokenIndex = new Map();
  readonly #generationIndex: TokenIndex = new Map();
  readonly #eventIndex: TokenIndex = new Map();
  readonly #pitchIndex: TokenIndex = new Map();
  readonly #ownerIndex: TokenIndex = new Map();
  readonly #instrumentIndex: TokenIndex = new Map();
  readonly #recordReads: (count: number) => void;
  readonly #recordWrites: (count: number) => void;

  constructor(
    recordReads: (count: number) => void,
    recordWrites: (count: number) => void,
  ) {
    this.#recordReads = recordReads;
    this.#recordWrites = recordWrites;
  }

  get size(): number {
    return this.#voices.size;
  }

  add(voice: SynthVoice): void {
    if (this.#voices.has(voice.instanceToken)) {
      throw new Error("AUDIO_REGISTRY_INSTANCE_TOKEN_DUPLICATE");
    }
    this.#voices.set(voice.instanceToken, voice);
    addReference(this.#voiceIndex, voice.voiceId, voice.instanceToken);
    addReference(
      this.#generationIndex,
      generationKey(voice.owner.kind, voice.owner.generation),
      voice.instanceToken,
    );
    addReference(
      this.#eventIndex,
      eventKey(voice.owner, voice.eventId),
      voice.instanceToken,
    );
    addReference(
      this.#pitchIndex,
      pitchKey(voice.owner, voice.midiPitch),
      voice.instanceToken,
    );
    addReference(this.#ownerIndex, ownerKey(voice.owner), voice.instanceToken);
    addReference(
      this.#instrumentIndex,
      voice.instrumentId,
      voice.instanceToken,
    );
    this.#recordWrites(6);
  }

  get(instanceToken: number): SynthVoice | undefined {
    this.#recordReads(1);
    return this.#voices.get(instanceToken);
  }

  remove(instanceToken: number): SynthVoice | undefined {
    this.#recordReads(1);
    const voice = this.#voices.get(instanceToken);
    if (voice === undefined) return undefined;
    this.#voices.delete(instanceToken);
    deleteReference(this.#voiceIndex, voice.voiceId, instanceToken);
    deleteReference(
      this.#generationIndex,
      generationKey(voice.owner.kind, voice.owner.generation),
      instanceToken,
    );
    deleteReference(
      this.#eventIndex,
      eventKey(voice.owner, voice.eventId),
      instanceToken,
    );
    deleteReference(
      this.#pitchIndex,
      pitchKey(voice.owner, voice.midiPitch),
      instanceToken,
    );
    deleteReference(this.#ownerIndex, ownerKey(voice.owner), instanceToken);
    deleteReference(this.#instrumentIndex, voice.instrumentId, instanceToken);
    this.#recordWrites(6);
    return voice;
  }

  allVoices(): readonly SynthVoice[] {
    this.#recordReads(this.#voices.size);
    return [...this.#voices.values()].sort(compareSynthVoiceIdentity);
  }

  voicesForVoiceId(voiceId: string): readonly SynthVoice[] {
    const tokens = this.#voiceIndex.get(voiceId);
    this.#recordReads(1 + (tokens?.size ?? 0));
    return this.#voicesForTokens(tokens);
  }

  retriggerMatches(
    owner: AudioVoiceOwner,
    eventId: string,
    midiPitch: number,
  ): readonly SynthVoice[] {
    const tokens = this.#eventIndex.get(eventKey(owner, eventId));
    this.#recordReads(1 + (tokens?.size ?? 0));
    if (tokens === undefined) return [];
    const matches: SynthVoice[] = [];
    for (const token of tokens) {
      const voice = this.#voices.get(token);
      if (
        voice !== undefined &&
        voice.midiPitch === midiPitch &&
        sameAudioOwner(voice.owner, owner)
      ) {
        matches.push(voice);
      }
    }
    return matches.sort(compareSynthVoiceIdentity);
  }

  voicesForSelector(
    selector: AudioRetirementSelector,
  ): readonly SynthVoice[] {
    if (selector.kind === "all") return this.allVoices();
    if (selector.kind === "voice-ids") {
      const tokens = new Set<number>();
      for (const voiceId of selector.voiceIds) {
        const matches = this.#voiceIndex.get(voiceId);
        this.#recordReads(1 + (matches?.size ?? 0));
        if (matches !== undefined) {
          for (const token of matches) tokens.add(token);
        }
      }
      return this.#voicesForTokens(tokens);
    }
    if (selector.kind === "event") {
      const tokens = this.#eventIndex.get(
        eventKey(selector.owner, selector.eventId),
      );
      this.#recordReads(1 + (tokens?.size ?? 0));
      return this.#voicesForTokens(tokens);
    }
    if (selector.kind === "pitch") {
      const tokens = this.#pitchIndex.get(
        pitchKey(selector.owner, selector.midiPitch),
      );
      this.#recordReads(1 + (tokens?.size ?? 0));
      return this.#voicesForTokens(tokens);
    }
    if (selector.kind === "generation") {
      const tokens = this.#generationIndex.get(
        generationKey(selector.ownerKind, selector.generation),
      );
      this.#recordReads(1 + (tokens?.size ?? 0));
      return this.#voicesForTokens(tokens);
    }
    if (selector.kind === "preview") {
      const tokens = this.#ownerIndex.get(
        ownerKey({
          kind: "preview",
          generation: selector.generation,
          previewId: selector.previewId,
        }),
      );
      this.#recordReads(1 + (tokens?.size ?? 0));
      return this.#voicesForTokens(tokens);
    }
    const tokens = this.#ownerIndex.get(ownerKey(selector.owner));
    this.#recordReads(1 + (tokens?.size ?? 0));
    return this.#voicesForTokens(tokens);
  }

  indexCounts(): AudioRegistryIndexCounts {
    const voice = referenceCount(this.#voiceIndex);
    const generation = referenceCount(this.#generationIndex);
    const event = referenceCount(this.#eventIndex);
    const pitch = referenceCount(this.#pitchIndex);
    const owner = referenceCount(this.#ownerIndex);
    const instrument = referenceCount(this.#instrumentIndex);
    this.#recordReads(6);
    return Object.freeze({
      voice,
      generation,
      event,
      pitch,
      owner,
      instrument,
      totalReferences:
        voice + generation + event + pitch + owner + instrument,
    });
  }

  /** Terminal fault cleanup cannot depend on already-exhausted work counters. */
  drainForTerminalCleanup(): readonly SynthVoice[] {
    const voices = [...this.#voices.values()].sort(compareSynthVoiceIdentity);
    this.#voices.clear();
    this.#voiceIndex.clear();
    this.#generationIndex.clear();
    this.#eventIndex.clear();
    this.#pitchIndex.clear();
    this.#ownerIndex.clear();
    this.#instrumentIndex.clear();
    return voices;
  }

  #voicesForTokens(tokens: ReadonlySet<number> | undefined): SynthVoice[] {
    if (tokens === undefined) return [];
    const voices: SynthVoice[] = [];
    for (const token of tokens) {
      const voice = this.#voices.get(token);
      if (voice !== undefined) voices.push(voice);
    }
    return voices.sort(compareSynthVoiceIdentity);
  }
}
