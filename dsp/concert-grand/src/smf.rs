//! `smf_*`: the M0 Standard MIDI File decoder.
//!
//! A TOTAL streaming decode of the SMF 1.0 subset frozen by
//! `src/export/midi-import-contract.ts`: header and track chunks, alien
//! chunks, variable-length quantities, running status, the six consumed and
//! ten tolerated meta types, sysex/escape events, note on/off pairing, and
//! the exact-integer resource caps. Every hostile input maps to one of the
//! frozen refusal codes with the detection byte offset the contract names.
//! No input can reach a panic: there is no indexing without a bound check,
//! no arithmetic that can overflow (tick accumulation is `i64` under a
//! 2^30 horizon), no allocation, and no host import.
//!
//! The decoder writes a self-describing tagged record stream of `i32` words
//! into a caller-owned buffer. It deliberately does NOT build the decode
//! model: assembling tracks, decoding UTF-8 text, and sorting each track's
//! notes by (onTick, channel, key) happen in TypeScript, where the frozen
//! contract types live. Keeping the wasm boundary at "validated tokens"
//! keeps the module allocation-free — the largest state it holds is one
//! open-note table of 16 channels by 128 keys.
//!
//! Record framing: `[tag, payloadWords, ...payload]`, repeated. A refusal
//! resets the stream and emits exactly one `SMF_TAG_REFUSAL` record, so a
//! refusal is never accompanied by a partial result.

/// Refusal code indices. These are positions in the frozen
/// `MIDI_IMPORT_REFUSAL_CODES` tuple; the TypeScript side maps them back.
/// The three request-phase codes (0..=2) are resolved before the bytes ever
/// reach this module and are listed only so the indices line up.
const SMF_HEADER_INVALID: i32 = 3;
const SMF_FORMAT_UNSUPPORTED: i32 = 4;
const SMF_TRACK_COUNT_INVALID: i32 = 5;
const SMF_DIVISION_SMPTE_UNSUPPORTED: i32 = 6;
const SMF_DIVISION_ZERO: i32 = 7;
const SMF_CHUNK_INVALID: i32 = 8;
const SMF_CHUNK_TRUNCATED: i32 = 9;
const SMF_DELTA_INVALID: i32 = 10;
const SMF_EVENT_INVALID: i32 = 11;
const SMF_META_UNKNOWN: i32 = 12;
const SMF_META_LENGTH_INVALID: i32 = 13;
const SMF_META_OVERSIZED: i32 = 14;
const SMF_TEMPO_ZERO: i32 = 15;
const SMF_METER_INVALID: i32 = 16;
const SMF_END_OF_TRACK_INVALID: i32 = 17;
const SMF_CONDUCTOR_META_MISPLACED: i32 = 18;
const SMF_NOTE_OVERLAP: i32 = 19;
const SMF_NOTE_OFF_UNMATCHED: i32 = 20;
const SMF_NOTE_ON_UNTERMINATED: i32 = 21;
const SMF_TRACKS_EXCEEDED: i32 = 22;
const SMF_EVENTS_EXCEEDED: i32 = 23;
const SMF_NOTES_EXCEEDED: i32 = 24;
const SMF_TICK_HORIZON_EXCEEDED: i32 = 25;
const SMF_TEMPO_CHANGES_EXCEEDED: i32 = 26;
const SMF_METER_CHANGES_EXCEEDED: i32 = 27;

/// Ignored-event kind indices, positions in the frozen
/// `MIDI_IMPORT_IGNORED_EVENT_KINDS` tuple.
const KIND_SEQUENCE_NUMBER: i32 = 0;
const KIND_TEXT: i32 = 1;
const KIND_COPYRIGHT: i32 = 2;
const KIND_LYRIC: i32 = 3;
const KIND_CUE_POINT: i32 = 4;
const KIND_CHANNEL_PREFIX: i32 = 5;
const KIND_MIDI_PORT: i32 = 6;
const KIND_SMPTE_OFFSET: i32 = 7;
const KIND_KEY_SIGNATURE: i32 = 8;
const KIND_SEQUENCER_SPECIFIC: i32 = 9;
const KIND_DUPLICATE_TRACK_NAME: i32 = 10;
const KIND_DUPLICATE_INSTRUMENT_NAME: i32 = 11;
const KIND_SYSEX: i32 = 12;
const KIND_ESCAPE: i32 = 13;
const KIND_POLY_AFTERTOUCH: i32 = 14;
const KIND_CONTROL_CHANGE: i32 = 15;
const KIND_PROGRAM_CHANGE: i32 = 16;
const KIND_CHANNEL_AFTERTOUCH: i32 = 17;
const KIND_PITCH_BEND: i32 = 18;

/// Record tags of the output stream.
const SMF_TAG_HEADER: i32 = 1;
const SMF_TAG_TEMPO: i32 = 2;
const SMF_TAG_METER: i32 = 3;
const SMF_TAG_TRACK: i32 = 4;
const SMF_TAG_MARKER: i32 = 5;
const SMF_TAG_NOTE: i32 = 6;
const SMF_TAG_IGNORED: i32 = 7;
const SMF_TAG_ALIEN: i32 = 8;
const SMF_TAG_COUNTERS: i32 = 9;
const SMF_TAG_REFUSAL: i32 = 10;

/// Exact-integer resource bounds, restated from the frozen contract.
const SMF_MAX_TRACKS: i32 = 64;
const SMF_MAX_EVENTS: i64 = 524_288;
const SMF_MAX_NOTES: i64 = 131_072;
const SMF_MAX_TICK_HORIZON: i64 = 1_073_741_823;
const SMF_MAX_TEMPO_CHANGES: i64 = 4_096;
const SMF_MAX_METER_CHANGES: i64 = 1_024;
const SMF_MAX_META_PAYLOAD_BYTES: i64 = 1_024;
const SMF_MAX_METER_NUMERATOR: i32 = 32;
const SMF_MAX_METER_DENOMINATOR_POWER: i32 = 5;
const SMF_MAX_VLQ_BYTES: u32 = 4;

/// One structured refusal: a frozen code, the detection byte offset, and the
/// track being parsed at detection time (`-1` where the contract says null).
#[derive(Clone, Copy)]
struct Refusal {
    code: i32,
    byte_offset: i32,
    track_index: i32,
}

impl Refusal {
    const fn at(code: i32, byte_offset: usize) -> Self {
        Self {
            code,
            byte_offset: byte_offset as i32,
            track_index: -1,
        }
    }

    const fn in_track(self, track_index: i32) -> Self {
        Self {
            code: self.code,
            byte_offset: self.byte_offset,
            track_index,
        }
    }
}

/// A bounds-checked word sink. Writes past the caller's capacity are dropped
/// while the cursor keeps counting, so one pass reports the exact capacity a
/// retry needs instead of truncating silently.
struct Sink {
    ptr: *mut i32,
    cap: usize,
    cursor: usize,
}

impl Sink {
    fn push(&mut self, value: i32) {
        if self.cursor < self.cap {
            // SAFETY: `cursor < cap`, and the caller guarantees `ptr` addresses
            // `cap` writable i32 words in this module's linear memory.
            unsafe {
                *self.ptr.add(self.cursor) = value;
            }
        }
        self.cursor = self.cursor.saturating_add(1);
    }

    fn record(&mut self, tag: i32, payload: &[i32]) {
        self.push(tag);
        self.push(payload.len() as i32);
        for value in payload {
            self.push(*value);
        }
    }

    fn reset(&mut self) {
        self.cursor = 0;
    }
}

/// Deterministic work/state/memory counters for one decode.
struct Counters {
    chunks_seen: i32,
    events_decoded: i64,
    events_ignored: i64,
    notes_opened: i64,
    notes_paired: i64,
    peak_open_notes: i32,
    tempo_changes: i64,
    meter_changes: i64,
}

/// Total byte read. Every call site is already inside a checked bound; this
/// keeps that fact structural rather than a comment, so no input can reach a
/// slice panic even if a bound is later loosened.
fn byte_at(bytes: &[u8], offset: usize) -> u8 {
    match bytes.get(offset) {
        Some(byte) => *byte,
        None => 0,
    }
}

fn be_u16(bytes: &[u8], offset: usize) -> u32 {
    let high = match bytes.get(offset) {
        Some(value) => u32::from(*value),
        None => return 0,
    };
    let low = match bytes.get(offset + 1) {
        Some(value) => u32::from(*value),
        None => return 0,
    };
    (high << 8) | low
}

fn be_u32(bytes: &[u8], offset: usize) -> i64 {
    let mut value: i64 = 0;
    let mut index = 0usize;
    while index < 4 {
        let byte = match bytes.get(offset + index) {
            Some(value) => i64::from(*value),
            None => return value << (8 * (4 - index)),
        };
        value = (value << 8) | byte;
        index += 1;
    }
    value
}

/// Reads one variable-length quantity. A fifth continuation byte refuses with
/// `smf.delta_invalid` at the quantity's first byte; running off the end of the
/// enclosing chunk refuses with `smf.chunk_truncated` at that boundary.
fn read_vlq(bytes: &[u8], start: usize, limit: usize) -> Result<(i64, usize), Refusal> {
    let mut value: i64 = 0;
    let mut index = start;
    let mut consumed: u32 = 0;
    loop {
        if index >= limit {
            return Err(Refusal::at(SMF_CHUNK_TRUNCATED, limit));
        }
        let byte = match bytes.get(index) {
            Some(byte) => *byte,
            None => return Err(Refusal::at(SMF_CHUNK_TRUNCATED, limit)),
        };
        value = (value << 7) | i64::from(byte & 0x7f);
        index += 1;
        consumed += 1;
        if byte & 0x80 == 0 {
            return Ok((value, index));
        }
        if consumed >= SMF_MAX_VLQ_BYTES {
            return Err(Refusal::at(SMF_DELTA_INVALID, start));
        }
    }
}

/// The fixed payload length a meta type must declare, or `None` when the type
/// carries free-length text. Sequence-number metas accept 0 or 2 and are
/// handled separately.
fn fixed_meta_length(meta_type: u8) -> Option<i64> {
    match meta_type {
        0x51 => Some(3),
        0x58 => Some(4),
        0x2f => Some(0),
        0x20 => Some(1),
        0x21 => Some(1),
        0x54 => Some(5),
        0x59 => Some(2),
        _ => None,
    }
}

/// The ignored-ledger kind for a tolerated meta type, or `None` when the type
/// is consumed or outside the vocabulary entirely.
fn tolerated_meta_kind(meta_type: u8) -> Option<i32> {
    match meta_type {
        0x00 => Some(KIND_SEQUENCE_NUMBER),
        0x01 => Some(KIND_TEXT),
        0x02 => Some(KIND_COPYRIGHT),
        0x05 => Some(KIND_LYRIC),
        0x07 => Some(KIND_CUE_POINT),
        0x20 => Some(KIND_CHANNEL_PREFIX),
        0x21 => Some(KIND_MIDI_PORT),
        0x54 => Some(KIND_SMPTE_OFFSET),
        0x59 => Some(KIND_KEY_SIGNATURE),
        0x7f => Some(KIND_SEQUENCER_SPECIFIC),
        _ => None,
    }
}

/// Decodes one Standard MIDI File into the tagged record stream.
///
/// Returns the number of `i32` words the stream occupies. A return value
/// greater than `out_cap` means nothing was written past the capacity and the
/// caller should retry with a buffer of exactly that many words; the decode is
/// deterministic, so the retry produces the identical stream.
///
/// # Safety
///
/// `input` must address `input_len` readable bytes and `out` must address
/// `out_cap` writable `i32` words, both inside this module's linear memory.
#[no_mangle]
pub extern "C" fn smf_decode(
    input: *const u8,
    input_len: i32,
    out: *mut i32,
    out_cap: i32,
) -> i32 {
    if input.is_null() || out.is_null() || input_len < 0 || out_cap < 0 {
        return 0;
    }
    // SAFETY: the caller contract above.
    let bytes = unsafe { core::slice::from_raw_parts(input, input_len as usize) };
    let mut sink = Sink {
        ptr: out,
        cap: out_cap as usize,
        cursor: 0,
    };
    if let Err(refusal) = decode(bytes, &mut sink) {
        sink.reset();
        sink.record(
            SMF_TAG_REFUSAL,
            &[refusal.code, refusal.byte_offset, refusal.track_index],
        );
    }
    if sink.cursor > i32::MAX as usize {
        return i32::MAX;
    }
    sink.cursor as i32
}

fn decode(bytes: &[u8], sink: &mut Sink) -> Result<(), Refusal> {
    let length = bytes.len();
    if length < 14 {
        return Err(Refusal::at(SMF_HEADER_INVALID, length));
    }
    if bytes[0] != b'M' || bytes[1] != b'T' || bytes[2] != b'h' || bytes[3] != b'd' {
        return Err(Refusal::at(SMF_HEADER_INVALID, 0));
    }
    if be_u32(bytes, 4) != 6 {
        return Err(Refusal::at(SMF_HEADER_INVALID, 4));
    }
    let format = be_u16(bytes, 8) as i32;
    if format > 1 {
        return Err(Refusal::at(SMF_FORMAT_UNSUPPORTED, 8));
    }
    let declared_tracks = be_u16(bytes, 10) as i32;
    if declared_tracks == 0 || (format == 0 && declared_tracks != 1) {
        return Err(Refusal::at(SMF_TRACK_COUNT_INVALID, 10));
    }
    if declared_tracks > SMF_MAX_TRACKS {
        return Err(Refusal::at(SMF_TRACKS_EXCEEDED, 10));
    }
    let division = be_u16(bytes, 12) as i32;
    if division & 0x8000 != 0 {
        return Err(Refusal::at(SMF_DIVISION_SMPTE_UNSUPPORTED, 12));
    }
    if division == 0 {
        return Err(Refusal::at(SMF_DIVISION_ZERO, 12));
    }

    sink.record(SMF_TAG_HEADER, &[format, declared_tracks, division]);

    let mut counters = Counters {
        chunks_seen: 1,
        events_decoded: 0,
        events_ignored: 0,
        notes_opened: 0,
        notes_paired: 0,
        peak_open_notes: 0,
        tempo_changes: 0,
        meter_changes: 0,
    };
    let mut position = 14usize;
    let mut tracks_parsed = 0i32;

    while position < length {
        if position + 8 > length {
            return Err(Refusal::at(SMF_CHUNK_TRUNCATED, length));
        }
        let mut index = 0usize;
        while index < 4 {
            let byte = bytes[position + index];
            if !(0x20..=0x7e).contains(&byte) {
                return Err(Refusal::at(SMF_CHUNK_INVALID, position));
            }
            index += 1;
        }
        let is_track = bytes[position] == b'M'
            && bytes[position + 1] == b'T'
            && bytes[position + 2] == b'r'
            && bytes[position + 3] == b'k';
        let is_header = bytes[position] == b'M'
            && bytes[position + 1] == b'T'
            && bytes[position + 2] == b'h'
            && bytes[position + 3] == b'd';
        let declared = be_u32(bytes, position + 4);
        let data_start = position + 8;
        let data_end = data_start as i64 + declared;

        if is_header {
            // A second header chunk is neither a track nor an alien chunk: the
            // envelope is declared exactly once.
            return Err(Refusal::at(SMF_CHUNK_INVALID, position));
        }
        if is_track && tracks_parsed >= declared_tracks {
            return Err(Refusal::at(SMF_TRACK_COUNT_INVALID, position));
        }
        if data_end > length as i64 {
            return Err(Refusal::at(SMF_CHUNK_TRUNCATED, length));
        }
        counters.chunks_seen += 1;
        let data_end = data_end as usize;

        if is_track {
            parse_track(
                bytes,
                sink,
                &mut counters,
                format,
                tracks_parsed,
                data_start,
                data_end,
            )
            .map_err(|refusal| {
                if refusal.track_index < 0 {
                    refusal.in_track(tracks_parsed)
                } else {
                    refusal
                }
            })?;
            tracks_parsed += 1;
        } else {
            sink.record(
                SMF_TAG_ALIEN,
                &[
                    position as i32,
                    i32::from(bytes[position]),
                    i32::from(bytes[position + 1]),
                    i32::from(bytes[position + 2]),
                    i32::from(bytes[position + 3]),
                    declared as i32,
                ],
            );
        }
        position = data_end;
    }

    if tracks_parsed < declared_tracks {
        return Err(Refusal::at(SMF_TRACK_COUNT_INVALID, length));
    }

    sink.record(
        SMF_TAG_COUNTERS,
        &[
            length as i32,
            counters.chunks_seen,
            counters.events_decoded as i32,
            counters.events_ignored as i32,
            counters.notes_paired as i32,
            counters.peak_open_notes,
            counters.tempo_changes as i32,
            counters.meter_changes as i32,
        ],
    );
    Ok(())
}

#[allow(clippy::too_many_lines)]
fn parse_track(
    bytes: &[u8],
    sink: &mut Sink,
    counters: &mut Counters,
    format: i32,
    track_index: i32,
    data_start: usize,
    data_end: usize,
) -> Result<(), Refusal> {
    let mut position = data_start;
    let mut tick: i64 = 0;
    let mut running_status: i32 = -1;
    // Open-note table: 16 channels by 128 keys. `-1` is closed; any other
    // value is the note-on tick. Velocity rides alongside.
    let mut open_tick = [-1i64; 16 * 128];
    let mut open_velocity = [0i32; 16 * 128];
    let mut open_count: i32 = 0;
    let mut name_offset: i32 = -1;
    let mut name_length: i32 = 0;
    let mut instrument_offset: i32 = -1;
    let mut instrument_length: i32 = 0;

    loop {
        if position >= data_end {
            // The track never reached end-of-track.
            return Err(Refusal::at(SMF_END_OF_TRACK_INVALID, data_end));
        }
        let event_start = position;
        if counters.events_decoded + counters.events_ignored + 1 > SMF_MAX_EVENTS {
            return Err(Refusal::at(SMF_EVENTS_EXCEEDED, event_start));
        }
        let (delta, after_delta) = read_vlq(bytes, position, data_end)?;
        tick += delta;
        if tick > SMF_MAX_TICK_HORIZON {
            return Err(Refusal::at(SMF_TICK_HORIZON_EXCEEDED, event_start));
        }
        position = after_delta;
        if position >= data_end {
            return Err(Refusal::at(SMF_CHUNK_TRUNCATED, data_end));
        }
        let lead = bytes[position];

        if lead == 0xff {
            running_status = -1;
            let type_offset = position + 1;
            if type_offset >= data_end {
                return Err(Refusal::at(SMF_CHUNK_TRUNCATED, data_end));
            }
            let meta_type = bytes[type_offset];
            let length_offset = type_offset + 1;
            let (payload_length, payload_start) = read_vlq(bytes, length_offset, data_end)?;

            let consumed = matches!(meta_type, 0x03 | 0x04 | 0x06 | 0x2f | 0x51 | 0x58);
            let tolerated = tolerated_meta_kind(meta_type);
            if !consumed && tolerated.is_none() {
                return Err(Refusal::at(SMF_META_UNKNOWN, type_offset));
            }
            if meta_type == 0x00 {
                if payload_length != 0 && payload_length != 2 {
                    return Err(Refusal::at(SMF_META_LENGTH_INVALID, length_offset));
                }
            } else if let Some(fixed) = fixed_meta_length(meta_type) {
                if payload_length != fixed {
                    return Err(Refusal::at(SMF_META_LENGTH_INVALID, length_offset));
                }
            } else if payload_length > SMF_MAX_META_PAYLOAD_BYTES {
                return Err(Refusal::at(SMF_META_OVERSIZED, length_offset));
            }
            let payload_end = payload_start as i64 + payload_length;
            if payload_end > data_end as i64 {
                return Err(Refusal::at(SMF_CHUNK_TRUNCATED, data_end));
            }
            let payload_end = payload_end as usize;

            match meta_type {
                0x2f => {
                    counters.events_decoded += 1;
                    if open_count > 0 {
                        return Err(Refusal::at(SMF_NOTE_ON_UNTERMINATED, type_offset));
                    }
                    if payload_end < data_end {
                        return Err(Refusal::at(SMF_END_OF_TRACK_INVALID, payload_end));
                    }
                    sink.record(
                        SMF_TAG_TRACK,
                        &[
                            track_index,
                            name_offset,
                            name_length,
                            instrument_offset,
                            instrument_length,
                        ],
                    );
                    return Ok(());
                }
                0x51 => {
                    counters.tempo_changes += 1;
                    if counters.tempo_changes > SMF_MAX_TEMPO_CHANGES {
                        return Err(Refusal::at(SMF_TEMPO_CHANGES_EXCEEDED, event_start));
                    }
                    if format == 1 && track_index != 0 {
                        return Err(Refusal::at(SMF_CONDUCTOR_META_MISPLACED, type_offset));
                    }
                    let microseconds = (i64::from(byte_at(bytes, payload_start)) << 16)
                        | (i64::from(byte_at(bytes, payload_start + 1)) << 8)
                        | i64::from(byte_at(bytes, payload_start + 2));
                    if microseconds == 0 {
                        return Err(Refusal::at(SMF_TEMPO_ZERO, payload_start));
                    }
                    counters.events_decoded += 1;
                    sink.record(SMF_TAG_TEMPO, &[tick as i32, microseconds as i32]);
                }
                0x58 => {
                    counters.meter_changes += 1;
                    if counters.meter_changes > SMF_MAX_METER_CHANGES {
                        return Err(Refusal::at(SMF_METER_CHANGES_EXCEEDED, event_start));
                    }
                    if format == 1 && track_index != 0 {
                        return Err(Refusal::at(SMF_CONDUCTOR_META_MISPLACED, type_offset));
                    }
                    let numerator = i32::from(byte_at(bytes, payload_start));
                    if numerator == 0 || numerator > SMF_MAX_METER_NUMERATOR {
                        return Err(Refusal::at(SMF_METER_INVALID, payload_start));
                    }
                    let denominator_power = i32::from(byte_at(bytes, payload_start + 1));
                    if denominator_power > SMF_MAX_METER_DENOMINATOR_POWER {
                        return Err(Refusal::at(SMF_METER_INVALID, payload_start + 1));
                    }
                    counters.events_decoded += 1;
                    sink.record(SMF_TAG_METER, &[tick as i32, numerator, denominator_power]);
                }
                0x03 => {
                    if name_offset < 0 {
                        counters.events_decoded += 1;
                        name_offset = payload_start as i32;
                        name_length = payload_length as i32;
                    } else {
                        counters.events_ignored += 1;
                        sink.record(
                            SMF_TAG_IGNORED,
                            &[
                                track_index,
                                tick as i32,
                                KIND_DUPLICATE_TRACK_NAME,
                                position as i32,
                            ],
                        );
                    }
                }
                0x04 => {
                    if instrument_offset < 0 {
                        counters.events_decoded += 1;
                        instrument_offset = payload_start as i32;
                        instrument_length = payload_length as i32;
                    } else {
                        counters.events_ignored += 1;
                        sink.record(
                            SMF_TAG_IGNORED,
                            &[
                                track_index,
                                tick as i32,
                                KIND_DUPLICATE_INSTRUMENT_NAME,
                                position as i32,
                            ],
                        );
                    }
                }
                0x06 => {
                    counters.events_decoded += 1;
                    sink.record(
                        SMF_TAG_MARKER,
                        &[
                            track_index,
                            tick as i32,
                            payload_start as i32,
                            payload_length as i32,
                        ],
                    );
                }
                _ => {
                    counters.events_ignored += 1;
                    let kind = tolerated.unwrap_or(KIND_TEXT);
                    sink.record(
                        SMF_TAG_IGNORED,
                        &[track_index, tick as i32, kind, position as i32],
                    );
                }
            }
            position = payload_end;
            continue;
        }

        if lead == 0xf0 || lead == 0xf7 {
            running_status = -1;
            let (payload_length, payload_start) = read_vlq(bytes, position + 1, data_end)?;
            let payload_end = payload_start as i64 + payload_length;
            if payload_end > data_end as i64 {
                return Err(Refusal::at(SMF_CHUNK_TRUNCATED, data_end));
            }
            counters.events_ignored += 1;
            let kind = if lead == 0xf0 {
                KIND_SYSEX
            } else {
                KIND_ESCAPE
            };
            sink.record(
                SMF_TAG_IGNORED,
                &[track_index, tick as i32, kind, position as i32],
            );
            position = payload_end as usize;
            continue;
        }

        if (0xf1..=0xfe).contains(&lead) {
            return Err(Refusal::at(SMF_EVENT_INVALID, position));
        }

        // Channel voice message, possibly under running status.
        let status: i32;
        let status_offset = position;
        if lead >= 0x80 {
            status = i32::from(lead);
            running_status = status;
            position += 1;
        } else {
            if running_status < 0 {
                return Err(Refusal::at(SMF_EVENT_INVALID, position));
            }
            status = running_status;
        }
        let high = status & 0xf0;
        let channel = status & 0x0f;
        let data_count = if high == 0xc0 || high == 0xd0 { 1 } else { 2 };
        let mut data = [0i32; 2];
        let mut index = 0usize;
        while index < data_count {
            if position >= data_end {
                return Err(Refusal::at(SMF_CHUNK_TRUNCATED, data_end));
            }
            let byte = bytes[position];
            if byte >= 0x80 {
                return Err(Refusal::at(SMF_EVENT_INVALID, position));
            }
            data[index] = i32::from(byte);
            position += 1;
            index += 1;
        }
        let first_data_offset = position - data_count;

        match high {
            0x80 | 0x90 => {
                let key = data[0];
                let velocity = data[1];
                let slot = (channel as usize) * 128 + key as usize;
                let is_note_on = high == 0x90 && velocity > 0;
                if is_note_on {
                    counters.notes_opened += 1;
                    if note_cap_exceeded(counters.notes_opened) {
                        return Err(Refusal::at(SMF_NOTES_EXCEEDED, event_start));
                    }
                    if open_tick[slot] >= 0 {
                        return Err(Refusal::at(SMF_NOTE_OVERLAP, first_data_offset));
                    }
                    open_tick[slot] = tick;
                    open_velocity[slot] = velocity;
                    open_count += 1;
                    if open_count > counters.peak_open_notes {
                        counters.peak_open_notes = open_count;
                    }
                } else {
                    if open_tick[slot] < 0 {
                        return Err(Refusal::at(SMF_NOTE_OFF_UNMATCHED, first_data_offset));
                    }
                    sink.record(
                        SMF_TAG_NOTE,
                        &[
                            track_index,
                            channel,
                            key,
                            open_tick[slot] as i32,
                            tick as i32,
                            open_velocity[slot],
                        ],
                    );
                    open_tick[slot] = -1;
                    open_count -= 1;
                    counters.notes_paired += 1;
                }
                counters.events_decoded += 1;
            }
            _ => {
                counters.events_ignored += 1;
                let kind = match high {
                    0xa0 => KIND_POLY_AFTERTOUCH,
                    0xb0 => KIND_CONTROL_CHANGE,
                    0xc0 => KIND_PROGRAM_CHANGE,
                    0xd0 => KIND_CHANNEL_AFTERTOUCH,
                    _ => KIND_PITCH_BEND,
                };
                sink.record(
                    SMF_TAG_IGNORED,
                    &[track_index, tick as i32, kind, status_offset as i32],
                );
            }
        }
    }
}

/// The note cap is enforced where the contract names it: at the note-on that
/// would open the 131,073rd note, reported at that event's first byte. It is
/// checked by the caller-visible wrapper below so the hot loop stays flat.
#[inline]
fn note_cap_exceeded(opened: i64) -> bool {
    opened > SMF_MAX_NOTES
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_words(bytes: &[u8]) -> Vec<i32> {
        let mut out = vec![0i32; 4096];
        let written = smf_decode(
            bytes.as_ptr(),
            bytes.len() as i32,
            out.as_mut_ptr(),
            out.len() as i32,
        );
        assert!(written >= 0);
        out.truncate(written as usize);
        out
    }

    fn hex(text: &str) -> Vec<u8> {
        let raw: Vec<char> = text.chars().collect();
        let mut bytes = Vec::new();
        let mut index = 0usize;
        while index + 1 < raw.len() {
            let high = raw[index].to_digit(16).unwrap() as u8;
            let low = raw[index + 1].to_digit(16).unwrap() as u8;
            bytes.push((high << 4) | low);
            index += 2;
        }
        bytes
    }

    #[test]
    fn decodes_the_minimal_round_trip_golden() {
        let bytes = hex(concat!(
            "4D546864000000060001000203C04D54726B0000002100FF03015400FF510307A1",
            "2000FF58040402180800FF0604436D616A8740FF2F004D54726B0000002300FF03",
            "015600FF04014900903C600040600043608728803C0000400000430018FF2F00",
        ));
        let words = decode_words(&bytes);
        assert_eq!(words[0], SMF_TAG_HEADER);
        assert_eq!(&words[2..5], &[1, 2, 960]);
        let mut notes = 0;
        let mut index = 0usize;
        while index < words.len() {
            let tag = words[index];
            let payload = words[index + 1] as usize;
            if tag == SMF_TAG_NOTE {
                notes += 1;
            }
            if tag == SMF_TAG_COUNTERS {
                assert_eq!(words[index + 2], 98);
                assert_eq!(words[index + 3], 3);
                assert_eq!(words[index + 4], 14);
                assert_eq!(words[index + 5], 0);
                assert_eq!(words[index + 6], 3);
                assert_eq!(words[index + 7], 3);
            }
            index += 2 + payload;
        }
        assert_eq!(notes, 3);
    }

    #[test]
    fn refuses_format_two_at_offset_eight() {
        let bytes = hex("4D546864000000060002000100604D54726B0000000400FF2F00");
        let words = decode_words(&bytes);
        assert_eq!(words[0], SMF_TAG_REFUSAL);
        assert_eq!(&words[2..5], &[SMF_FORMAT_UNSUPPORTED, 8, -1]);
    }

    #[test]
    fn reports_required_capacity_without_writing_past_it() {
        let bytes = hex("4D546864000000060000000100604D54726B0000000400FF2F00");
        let mut tiny = [0i32; 2];
        let needed = smf_decode(
            bytes.as_ptr(),
            bytes.len() as i32,
            tiny.as_mut_ptr(),
            tiny.len() as i32,
        );
        assert!(needed > tiny.len() as i32);
        let mut exact = vec![0i32; needed as usize];
        let written = smf_decode(
            bytes.as_ptr(),
            bytes.len() as i32,
            exact.as_mut_ptr(),
            exact.len() as i32,
        );
        assert_eq!(written, needed);
    }

    #[test]
    fn note_cap_predicate_is_exact() {
        assert!(!note_cap_exceeded(SMF_MAX_NOTES));
        assert!(note_cap_exceeded(SMF_MAX_NOTES + 1));
    }
}
