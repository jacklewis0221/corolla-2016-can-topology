import type { Signal } from '../data/messages';

/** Next bit position in DBC Motorola (big-endian) numbering. */
function nextMotorola(pos: number): number {
  return pos % 8 === 0 ? pos + 15 : pos - 1;
}

export function physToRaw(sig: Signal, value: number): number {
  let raw = Math.round((value - sig.offset) / sig.factor);
  const max = sig.signed ? 2 ** (sig.len - 1) - 1 : 2 ** sig.len - 1;
  const min = sig.signed ? -(2 ** (sig.len - 1)) : 0;
  raw = Math.max(min, Math.min(max, raw));
  if (raw < 0) raw = raw + 2 ** sig.len; // two's complement
  return raw;
}

export function rawToPhys(sig: Signal, raw: number): number {
  let r = raw;
  if (sig.signed && r >= 2 ** (sig.len - 1)) r -= 2 ** sig.len;
  return r * sig.factor + sig.offset;
}

export function physRange(sig: Signal): [number, number] {
  const lo = sig.signed ? -(2 ** (sig.len - 1)) : 0;
  const hi = sig.signed ? 2 ** (sig.len - 1) - 1 : 2 ** sig.len - 1;
  const a = lo * sig.factor + sig.offset;
  const b = hi * sig.factor + sig.offset;
  return a < b ? [a, b] : [b, a];
}

/** Bit positions (0–63, byte*8 + bit) occupied by a signal, MSB first. */
export function signalBits(sig: Signal): number[] {
  const out: number[] = [];
  let pos = sig.start;
  for (let i = 0; i < sig.len; i++) {
    out.push(pos);
    pos = nextMotorola(pos);
  }
  return out;
}

export function encode(dlc: number, signals: Signal[], values: Record<string, number>): number[] {
  const data = new Array(dlc).fill(0) as number[];
  for (const sig of signals) {
    if (!(sig.name in values)) continue;
    const raw = physToRaw(sig, values[sig.name]);
    const bits = signalBits(sig);
    bits.forEach((pos, i) => {
      const bit = Math.floor(raw / 2 ** (sig.len - 1 - i)) % 2;
      const byte = Math.floor(pos / 8);
      const b = pos % 8;
      if (byte < dlc && bit) data[byte] |= 1 << b;
    });
  }
  return data;
}

export function decode(data: number[], sig: Signal): number {
  let raw = 0;
  for (const pos of signalBits(sig)) {
    const byte = Math.floor(pos / 8);
    const bit = byte < data.length ? (data[byte] >> pos % 8) & 1 : 0;
    raw = raw * 2 + bit;
  }
  return rawToPhys(sig, raw);
}

/** Toyota checksum (opendbc toyotacan.py): length + ID bytes + data bytes, low 8 bits, placed in the last byte. */
export function toyotaChecksum(id: number, data: number[]): number {
  let s = data.length + (id & 0xff) + ((id >> 8) & 0xff);
  for (let i = 0; i < data.length - 1; i++) s += data[i];
  return s & 0xff;
}

// ───────────────────────── CAN 2.0A frame on the wire ─────────────────────────

export type FieldKey = 'sof' | 'id' | 'rtr' | 'ide' | 'r0' | 'dlc' | 'data' | 'crc' | 'crcDel' | 'ack' | 'ackDel' | 'eof';

export interface FrameBit {
  bit: 0 | 1;
  field: FieldKey;
  stuff?: boolean;
  /** index of the bit inside its field */
  idx: number;
}

export const FIELD_INFO: Record<FieldKey, { label: string; short: string; desc: string }> = {
  sof: { label: 'Start of frame', short: 'SOF', desc: 'One dominant bit that wakes every receiver and lines up their clocks.' },
  id: { label: 'Identifier', short: 'ID', desc: '11 bits that name the message. Lower number = higher priority during arbitration.' },
  rtr: { label: 'Remote request', short: 'RTR', desc: 'Dominant (0) for a normal data frame.' },
  ide: { label: 'Identifier extension', short: 'IDE', desc: 'Dominant (0) means an 11-bit standard ID, as used on this car.' },
  r0: { label: 'Reserved', short: 'r0', desc: 'Reserved bit, sent dominant.' },
  dlc: { label: 'Data length code', short: 'DLC', desc: 'How many data bytes follow (0–8).' },
  data: { label: 'Data field', short: 'DATA', desc: 'The payload: packed signals such as engine speed or door status.' },
  crc: { label: 'CRC', short: 'CRC', desc: '15-bit cyclic redundancy check over SOF → data. Every receiver recomputes it.' },
  crcDel: { label: 'CRC delimiter', short: 'DEL', desc: 'Recessive spacer bit.' },
  ack: { label: 'Acknowledge slot', short: 'ACK', desc: 'The sender transmits recessive; any receiver that got the frame intact overwrites it with dominant.' },
  ackDel: { label: 'ACK delimiter', short: 'DEL', desc: 'Recessive spacer bit.' },
  eof: { label: 'End of frame', short: 'EOF', desc: 'Seven recessive bits close the frame.' },
};

function pushBits(arr: { bit: 0 | 1; field: FieldKey; idx: number }[], value: number, len: number, field: FieldKey) {
  for (let i = len - 1; i >= 0; i--) arr.push({ bit: ((value >> i) & 1) as 0 | 1, field, idx: len - 1 - i });
}

export function crc15(bits: (0 | 1)[]): number {
  let crc = 0;
  for (const b of bits) {
    const next = b ^ ((crc >> 14) & 1);
    crc = (crc << 1) & 0x7fff;
    if (next) crc ^= 0x4599;
  }
  return crc;
}

export function buildFrame(id: number, data: number[]) {
  const pre: { bit: 0 | 1; field: FieldKey; idx: number }[] = [];
  pre.push({ bit: 0, field: 'sof', idx: 0 });
  pushBits(pre, id, 11, 'id');
  pre.push({ bit: 0, field: 'rtr', idx: 0 }, { bit: 0, field: 'ide', idx: 0 }, { bit: 0, field: 'r0', idx: 0 });
  pushBits(pre, data.length, 4, 'dlc');
  data.forEach((byte, i) => {
    for (let b = 7; b >= 0; b--) pre.push({ bit: ((byte >> b) & 1) as 0 | 1, field: 'data', idx: i * 8 + (7 - b) });
  });
  const crc = crc15(pre.map((p) => p.bit));
  pushBits(pre, crc, 15, 'crc');

  // Bit stuffing applies from SOF through the CRC sequence.
  const stuffed: FrameBit[] = [];
  let run = 0;
  let last: 0 | 1 | -1 = -1;
  for (const p of pre) {
    stuffed.push({ ...p });
    if (p.bit === last) run++;
    else {
      run = 1;
      last = p.bit;
    }
    if (run === 5) {
      const sb = (p.bit ? 0 : 1) as 0 | 1;
      stuffed.push({ bit: sb, field: p.field, idx: p.idx, stuff: true });
      last = sb;
      run = 1;
    }
  }
  stuffed.push({ bit: 1, field: 'crcDel', idx: 0 });
  stuffed.push({ bit: 0, field: 'ack', idx: 0 });
  stuffed.push({ bit: 1, field: 'ackDel', idx: 0 });
  for (let i = 0; i < 7; i++) stuffed.push({ bit: 1, field: 'eof', idx: i });
  const stuffCount = stuffed.filter((b) => b.stuff).length;
  return { bits: stuffed, crc, stuffCount, unstuffedLength: pre.length + 10 };
}

export const BIT_TIME_US = 2; // 500 kbit/s

export const toHex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
export const toBin = (n: number, w: number) => n.toString(2).padStart(w, '0');

export function fmt(v: number, sig: Signal): string {
  const dec = sig.factor >= 1 ? 0 : sig.factor >= 0.1 ? 1 : 2;
  return v.toFixed(dec);
}
