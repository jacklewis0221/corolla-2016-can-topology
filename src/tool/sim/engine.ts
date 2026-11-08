// A small deterministic-feeling simulation of eight Corollas streaming through wireless adapters.
// Everything here is invented sample behavior; the frame layouts reuse the atlas message catalogue.

import { VEHICLES, YOU, type Vehicle } from '../data/fleet';
import { SIGNALS, SIG_INDEX, SIG, needsRequest, pidBytes } from '../data/signals';
import { ecusFor } from '../data/ecus';
import type { FixId, ProcStep } from '../data/procedures';
import { MESSAGES, type CanMessage } from '../../data/messages';
import { NODE_BY_ID } from '../../data/nodes';
import { PRESETS } from '../../lib/model';
import { encode, toyotaChecksum } from '../../lib/can';

export const RATE = 10;
export const HIST = 600;
const DT = 1 / RATE;
const N = SIGNALS.length;

export type Mode = 'listen' | 'read';
export type DtcStatus = 'confirmed' | 'pending' | 'history';
export interface DtcInst {
  code: string;
  ecu: string;
  status: DtcStatus;
  mil: boolean;
  miles: number;
  freeze?: [string, string][];
}
export type EcuStatus = 'idle' | 'querying' | 'ok' | 'none' | 'skipped';
export interface Frame {
  t: number;
  id: number;
  data: number[];
  tx?: boolean;
}
export interface IdStat {
  id: number;
  count: number;
  data: number[];
  prev: number[];
  t: number;
  period: number;
  changedAt: number[];
}
export interface SimEvent {
  at: number;
  vid: string;
  level: 'info' | 'warn' | 'error' | 'ok';
  text: string;
}
export type TestId = 'hold2500' | 'afInj' | 'crank' | 'deflate' | 'keyOff';
export interface StepResult {
  result: 'ok' | 'ng' | 'next' | 'wait';
  reading: string;
}

export interface Rt {
  v: Vehicle;
  id: string;
  phase: number;
  val: Float64Array;
  hist: Float32Array[];
  head: number;
  filled: number;
  engine: 'off' | 'run' | 'crank';
  mode: Mode;
  holder: string;
  handoff: number | null;
  fixed: Set<FixId>;
  dtcs: DtcInst[];
  returns: { code: string; ecu: string; at: number; status: DtcStatus }[];
  ecu: Record<string, { status: EcuStatus; dtcs: number; at?: number }>;
  scan: { state: 'idle' | 'run' | 'done'; i: number; next: number; order: string[]; doneAt?: number };
  test: { id: TestId; t0: number; arg?: number; wheel?: string } | null;
  link: { rssi: number; lat: number; fps: number; kbps: number; load: number; frames: number };
  msgs: CanMessage[];
  steps: Record<string, StepResult>;
  crank: { min: number; dur: number; samples: number[]; after: number } | null;
  tpms: { tested: Record<string, number | null>; registered: boolean; initialized: boolean };
  s: Record<string, number>;
  lamps: { mil: 0 | 1 | 2; abs: boolean; brake: boolean; slip: boolean; eps: boolean; tpms: 0 | 1 | 2; airbag: boolean; batt: boolean };
}

const set = (rt: Rt, id: string, v: number) => {
  rt.val[SIG_INDEX[id]] = v;
};
const get = (rt: Rt, id: string) => rt.val[SIG_INDEX[id]];
const wob = (t: number, k: number) => 0.6 * Math.sin(t * 0.83 + k) + 0.4 * Math.sin(t * 2.31 + k * 1.7);
const approach = (cur: number, target: number, rate: number) => cur + (target - cur) * Math.min(1, rate);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const PERIOD: Record<number, number> = {
  0x024: 20,
  0x025: 12,
  0x0aa: 12,
  0x0b4: 20,
  0x0ba: 20,
  0x1aa: 20,
  0x1c4: 20,
  0x1d0: 20,
  0x1d2: 30,
  0x1d3: 30,
  0x224: 25,
  0x260: 20,
  0x262: 25,
  0x2c1: 30,
  0x228: 30,
  0x320: 50,
  0x3b7: 100,
  0x3bc: 100,
  0x3b0: 200,
  0x3b1: 100,
  0x380: 200,
  0x381: 500,
  0x394: 100,
  0x399: 100,
  0x3bb: 200,
  0x3d3: 100,
  0x3e0: 200,
  0x3f9: 100,
  0x420: 100,
  0x423: 100,
  0x4ac: 1000,
  0x45a: 1000,
};
export const periodOf = (m: CanMessage) => PERIOD[m.id] ?? (m.id >= 0x600 ? 1000 : 500);

function presentMessages(v: Vehicle, skidOut: boolean): CanMessage[] {
  const o = PRESETS[v.preset].opts;
  return MESSAGES.filter((m) => {
    if (m.basis === 'diagnostic') return false;
    if (m.requires && !m.requires.every((r) => o[r])) return false;
    if (m.sender) {
      const n = NODE_BY_ID[m.sender];
      if (n?.requires && !n.requires.every((r) => o[r])) return false;
      if (n?.excludes && n.excludes.some((r) => o[r])) return false;
      if (skidOut && m.sender === 'skid') return false;
    }
    return true;
  });
}

function linkStats(msgs: CanMessage[]) {
  let fps = 0;
  let bits = 0;
  for (const m of msgs) {
    const r = 1000 / periodOf(m);
    fps += r;
    bits += r * (47 + 8 * m.dlc) * 1.12;
  }
  return { fps, kbps: bits / 1000 };
}

const INITIAL_DTCS: Record<string, DtcInst[]> = {
  misfire: [
    {
      code: 'P0301',
      ecu: 'ecm',
      status: 'confirmed',
      mil: true,
      miles: 118502,
      freeze: [
        ['Misfire RPM', '2,480 rpm'],
        ['Misfire Load', '68 %'],
        ['Vehicle speed', '77 km/h (48 mph)'],
        ['Coolant temperature', '92 °C (198 °F)'],
        ['Intake air temperature', '9 °C (48 °F)'],
        ['Short-term fuel trim', '+1.6 %'],
        ['Long-term fuel trim', '+2.3 %'],
      ],
    },
  ],
  lean: [
    {
      code: 'P0171',
      ecu: 'ecm',
      status: 'confirmed',
      mil: true,
      miles: 131188,
      freeze: [
        ['Engine speed', '702 rpm'],
        ['Calculated load', '19 %'],
        ['Coolant temperature', '84 °C (183 °F)'],
        ['Short-term fuel trim', '+7.8 %'],
        ['Long-term fuel trim', '+21.9 %'],
        ['Mass air flow', '2.1 g/s'],
      ],
    },
  ],
  canSkid: ['ecm', 'eps', 'meter', 'nav'].map((ecu) => ({
    code: 'U0129',
    ecu,
    status: 'confirmed' as DtcStatus,
    mil: false,
    miles: 96052,
    freeze: [
      ['Vehicle speed', '0 km/h (no data)'],
      ['Battery voltage', '14.1 V'],
    ] as [string, string][],
  })),
  tpms: [{ code: 'C2123', ecu: 'tpms', status: 'confirmed', mil: false, miles: 104210 }],
  acLow: [{ code: 'B1423', ecu: 'ac', status: 'confirmed', mil: false, miles: 77490 }],
};

/** Wheel → transmitter ID mapping for the TPMS scenario (unknown to the technician until step 2). */
export const TPMS_MAP: Record<string, number> = { LF: 2, RF: 4, LR: 1, RR: 3 };
export const TPMS_IDS: Record<number, string> = { 1: '1A0C77D', 2: '1A0C6F2', 3: '2C4A91F', 4: '1A0C803' };

export class Sim {
  rts: Rt[];
  byId: Record<string, Rt>;
  tick = 0;
  rev = 0;
  t = 0;
  events: SimEvent[] = [];
  monitor: string | null = null;
  trace: Frame[] = [];
  idStats = new Map<number, IdStat>();
  private acc = new Map<number, number>();
  private counters = new Map<number, number>();
  private pidIdx = 0;
  private timer: number | null = null;
  private listeners = new Set<() => void>();
  paused = false;
  frozen = false;

  constructor() {
    this.rts = VEHICLES.map((v, i) => this.make(v, i));
    this.byId = Object.fromEntries(this.rts.map((r) => [r.id, r]));
    const now = Date.now();
    const seed: [number, string, SimEvent['level'], string][] = [
      [-540, 'quick', 'ok', 'Express oil change complete; final scan found no codes'],
      [-420, 'bay3', 'warn', 'U0129 stored by 4 ECUs — skid control ECU not answering'],
      [-300, 'bay7', 'info', 'A/C requested; compressor held off by the A/C amplifier'],
      [-200, 'bay6', 'warn', 'TPMS: no signal from transmitter ID 3'],
      [-120, 'bay2', 'warn', 'Long-term fuel trim +21.9 % at idle'],
      [-45, 'road', 'info', 'Road test started — adapter roaming to AP-3 (lot)'],
    ];
    for (const [dt, vid, level, text] of seed) this.events.unshift({ at: now + dt * 1000, vid, level, text });
    for (let i = 0; i < HIST; i++) this.step(true);
  }

  private make(v: Vehicle, i: number): Rt {
    const skidOut = v.scenario === 'canSkid';
    const msgs = presentMessages(v, skidOut);
    const ls = linkStats(msgs);
    const rt: Rt = {
      v,
      id: v.id,
      phase: i * 1.37 + 0.4,
      val: new Float64Array(N).fill(NaN),
      hist: SIGNALS.map(() => new Float32Array(HIST).fill(NaN)),
      head: 0,
      filled: 0,
      engine: ['battery', 'maint', 'ready'].includes(v.scenario) ? 'off' : 'run',
      mode: v.mode,
      holder: v.holder,
      handoff: null,
      fixed: new Set(),
      dtcs: (INITIAL_DTCS[v.scenario] ?? []).map((d) => ({ ...d })),
      returns: [],
      ecu: {},
      scan: { state: 'idle', i: 0, next: 0, order: [] },
      test: null,
      link: { rssi: v.adapter.rssi, lat: v.adapter.latency, fps: ls.fps, kbps: ls.kbps, load: ls.kbps / 500, frames: 0 },
      msgs,
      steps: {},
      crank: null,
      tpms: { tested: {}, registered: false, initialized: false },
      s: {
        ect: v.scenario === 'battery' ? 21 : v.scenario === 'maint' || v.scenario === 'ready' ? 48 : 88,
        run: 300 + i * 97,
        fuel: 30 + ((i * 17) % 55),
        ltft: v.scenario === 'lean' ? 21.9 : 1.6,
        mf: 0,
        stft: 0,
        vb: v.scenario === 'battery' ? 12.05 : 12.58,
        evap: 20.5,
        vent: 21.5,
        odo: v.miles,
        rpm: 0,
      },
      lamps: { mil: 0, abs: false, brake: false, slip: false, eps: false, tpms: 0, airbag: false, batt: false },
    };
    for (const e of ecusFor(v.preset)) rt.ecu[e.node] = { status: 'idle', dtcs: 0 };
    return rt;
  }

  // ───────────── subscription ─────────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    this.listeners.forEach((l) => l());
  }
  bump() {
    this.rev++;
    this.emit();
  }

  start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      if (!this.paused && !this.frozen) this.step(false);
    }, 1000 / RATE);
  }
  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  log(vid: string, level: SimEvent['level'], text: string) {
    this.events.unshift({ at: Date.now(), vid, level, text });
    if (this.events.length > 60) this.events.length = 60;
  }

  // ───────────── main tick ─────────────
  step(silent: boolean) {
    this.tick++;
    this.t += DT;
    for (const rt of this.rts) {
      this.scenario(rt);
      this.record(rt);
      this.updateLink(rt);
      this.runScan(rt);
      this.runReturns(rt);
      if (rt.handoff !== null && this.t >= rt.handoff) {
        rt.handoff = null;
        const from = rt.holder;
        rt.holder = YOU;
        this.log(rt.id, 'ok', `${from} handed control to you`);
        this.rev++;
      }
    }
    if (this.monitor && this.byId[this.monitor]) this.frames(this.byId[this.monitor]);
    if (!silent) this.emit();
  }

  private record(rt: Rt) {
    const h = rt.head;
    for (let i = 0; i < N; i++) rt.hist[i][h] = rt.val[i];
    rt.head = (h + 1) % HIST;
    rt.filled = Math.min(HIST, rt.filled + 1);
  }

  /** Last `n` samples of a signal, oldest first. */
  series(rt: Rt, id: string, n = HIST): Float32Array {
    const buf = rt.hist[SIG_INDEX[id]];
    const len = Math.min(n, rt.filled);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = buf[(rt.head - len + i + HIST) % HIST];
    return out;
  }

  /** Value as the console may show it: request-based items need a read session. */
  read(rt: Rt, id: string): number {
    const s = SIG[id];
    if (!s) return NaN;
    if (needsRequest(s) && rt.mode === 'listen') return NaN;
    return get(rt, id);
  }

  gated(rt: Rt, id: string): boolean {
    return needsRequest(SIG[id]) && rt.mode === 'listen';
  }

  private updateLink(rt: Rt) {
    const k = rt.phase;
    const t = this.t;
    let rssi = rt.v.adapter.rssi + 2.5 * wob(t * 0.3, k);
    let lat = rt.v.adapter.latency + 3 * Math.abs(wob(t * 0.9, k * 2));
    if (rt.id === 'road') {
      const loop = (t % 150) / 150;
      rssi = -62 - 11 * Math.sin(loop * Math.PI * 2) + 2 * wob(t, k);
      lat = 30 + 18 * Math.max(0, Math.sin(loop * Math.PI * 2)) + 4 * Math.abs(wob(t * 1.3, k));
    }
    const ls = linkStats(rt.msgs);
    const j = 1 + 0.015 * wob(t * 2.2, k);
    const poll = rt.mode === 'read' ? 20 : 0;
    rt.link = {
      rssi,
      lat,
      fps: ls.fps * j + poll,
      kbps: ls.kbps * j,
      load: (ls.kbps * j) / 500,
      frames: rt.link.frames + (ls.fps * j + poll) * DT,
    };
  }

  // ───────────── scenarios ─────────────
  private base(rt: Rt) {
    const t = this.t;
    const k = rt.phase;
    const outdoor = rt.id === 'road';
    set(rt, 'baro', 98.4 + 0.1 * wob(t * 0.05, k));
    set(rt, 'fuel', rt.s.fuel);
    set(rt, 'amb', outdoor ? 4 : 20.5);
    set(rt, 'pbrake', outdoor ? 0 : 1);
    set(rt, 'belt', outdoor ? 0 : 1);
    set(rt, 'doorFL', 0);
    set(rt, 'lowBeam', outdoor ? 1 : 0);
    set(rt, 'gear', 32);
    for (const w of ['vss', 'wsFL', 'wsFR', 'wsRL', 'wsRR']) set(rt, w, 0);
    set(rt, 'brake', 0);
    set(rt, 'steer', Math.round(1.5 * wob(t * 0.05, k)));
    set(rt, 'yaw', 0.12 * wob(t * 1.7, k));
    set(rt, 'ax', 0.02 * wob(t * 2.1, k));
    set(rt, 'ay', 0.02 * wob(t * 1.9, k + 1));
    set(rt, 'epsTq', Math.round(3 * wob(t * 1.1, k)));
    set(rt, 'blower', 0);
    set(rt, 'comp', 0);
    set(rt, 'acp', 0.52 + 0.004 * wob(t, k));
    rt.s.evap = approach(rt.s.evap, outdoor ? 6 : 20.5, 0.01);
    rt.s.vent = approach(rt.s.vent, outdoor ? 12 : 21.5, 0.01);
    set(rt, 'evap', rt.s.evap);
    set(rt, 'vent', rt.s.vent);
    const tp = [223, 219, 221, 222];
    tp.forEach((p, i) => set(rt, `tp${i + 1}`, p + 0.6 * wob(t * 0.02, k + i) - (outdoor ? 14 : 0)));
    rt.lamps = { mil: 0, abs: false, brake: false, slip: false, eps: false, tpms: 0, airbag: false, batt: false };
  }

  private idle(rt: Rt, o: { rpm?: number; rough?: number; maf?: number; stft?: number; afs?: number; o2?: number } = {}) {
    const t = this.t;
    const k = rt.phase;
    const target = o.rpm ?? 690;
    rt.s.rpm = approach(rt.s.rpm, target, 0.35);
    let rpm = rt.s.rpm + 8 * wob(t * 1.3, k);
    if (o.rough) rpm -= o.rough * Math.pow(Math.max(0, Math.sin(t * 2.7 + k)), 12);
    const hi = clamp((rt.s.rpm - 700) / 1800, 0, 1);
    set(rt, 'rpm', rpm);
    set(rt, 'nt', rpm * 0.97);
    set(rt, 'load', 21 + hi * 4 + 0.8 * wob(t, k));
    set(rt, 'maf', (o.maf ?? 2.6) * (1 + hi * 1.75) + 0.07 * wob(t * 1.7, k));
    set(rt, 'map', 31 - hi * 2 + 0.8 * wob(t * 0.7, k));
    set(rt, 'tps', 13.5 + hi * 5 + 0.2 * wob(t, k));
    set(rt, 'accp', hi * 9);
    set(rt, 'etq', 15 + hi * 6 + 1.5 * wob(t * 1.1, k));
    set(rt, 'timing', 9 + hi * 18 + 1.8 * wob(t * 1.5, k));
    rt.s.ect = approach(rt.s.ect, 90.5, 0.003);
    set(rt, 'ect', rt.s.ect + 0.4 * wob(t * 0.1, k));
    set(rt, 'iat', 27 + 0.6 * wob(t * 0.05, k));
    rt.s.stft = approach(rt.s.stft, o.stft ?? 0, 0.08);
    const osc = 3 * Math.sin(t * 1.9 + k);
    set(rt, 'stft', rt.s.stft + osc);
    set(rt, 'ltft', rt.s.ltft);
    set(rt, 'afs', (o.afs ?? 3.3) - 0.05 * Math.sin(t * 1.9 + k));
    set(rt, 'o2s2', (o.o2 ?? 0.68) + 0.04 * wob(t * 0.6, k));
    for (const c of ['mf1', 'mf2', 'mf3', 'mf4']) set(rt, c, 0);
    set(rt, 'mfm', 62 + 3 * wob(t * 0.4, k));
    rt.s.run += DT;
    set(rt, 'runtime', rt.s.run);
    const vb = 14.15 + 0.05 * wob(t * 0.8, k);
    set(rt, 'modv', vb);
    set(rt, 'vbat', vb - 0.05);
    rt.engine = 'run';
  }

  private off(rt: Rt, vb: number) {
    const t = this.t;
    const k = rt.phase;
    for (const id of ['rpm', 'nt', 'load', 'maf', 'tps', 'accp', 'etq', 'runtime', 'mf1', 'mf2', 'mf3', 'mf4']) set(rt, id, 0);
    set(rt, 'map', get(rt, 'baro'));
    set(rt, 'timing', 5);
    rt.s.ect = approach(rt.s.ect, 20.5, 0.0008);
    set(rt, 'ect', rt.s.ect);
    set(rt, 'iat', 21 + 0.3 * wob(t * 0.05, k));
    set(rt, 'stft', 0);
    set(rt, 'ltft', rt.s.ltft);
    set(rt, 'afs', 3.3);
    set(rt, 'o2s2', 0.45);
    set(rt, 'mfm', NaN);
    const v = vb + 0.008 * wob(t * 0.9, k);
    set(rt, 'vbat', v);
    set(rt, 'modv', v - 0.08);
    rt.s.rpm = 0;
    rt.s.run = 0;
    rt.engine = 'off';
  }

  private scenario(rt: Rt) {
    this.base(rt);
    const t = this.t;
    const k = rt.phase;
    const fixed = rt.fixed;
    const test = rt.test;
    const keyOff = test?.id === 'keyOff';
    switch (rt.v.scenario) {
      case 'misfire': {
        this.drive(rt, !fixed.has('plugs'));
        break;
      }
      case 'lean': {
        const leak = !fixed.has('pcv');
        if (!leak) rt.s.ltft = approach(rt.s.ltft, 2.4, 0.006);
        const hold = test?.id === 'hold2500';
        const af = test?.id === 'afInj' ? (test.arg ?? 0) : 0;
        this.idle(rt, {
          rpm: hold ? 2500 : leak ? 680 + 22 * Math.sin(t * 0.45 + k) : 690,
          rough: leak && !hold ? 45 : 0,
          maf: leak ? 2.1 : 2.6,
          stft: hold ? (leak ? -10 : 0.5) : leak ? 6 : 0,
          afs: af > 0 ? 2.95 : af < 0 ? 3.62 : leak ? 3.46 : 3.3,
          o2: af > 0 ? 0.82 : af < 0 ? 0.08 : leak ? 0.18 : 0.68,
        });
        if (af !== 0) set(rt, 'stft', af > 0 ? 12.5 : -12.5);
        if (hold && test && t - test.t0 > 25) this.endTest(rt);
        if (af !== 0 && test && t - test.t0 > 15) this.endTest(rt);
        if (leak) rt.lamps.mil = 1;
        break;
      }
      case 'canSkid': {
        this.idle(rt);
        if (!fixed.has('branch')) {
          for (const w of ['vss', 'wsFL', 'wsFR', 'wsRL', 'wsRR', 'brake']) set(rt, w, NaN);
          rt.lamps.abs = true;
          rt.lamps.brake = true;
          rt.lamps.slip = true;
          rt.lamps.eps = true;
        }
        break;
      }
      case 'battery': {
        this.battery(rt);
        break;
      }
      case 'maint': {
        if (keyOff || !test) this.off(rt, 12.55);
        break;
      }
      case 'tpms': {
        this.idle(rt);
        const alive = fixed.has('tpms') && rt.tpms.registered;
        if (!alive) {
          set(rt, 'tp3', NaN);
          rt.lamps.tpms = 2;
        } else if (!rt.tpms.initialized) rt.lamps.tpms = 1;
        if (test?.id === 'deflate' && test.wheel) {
          const dt = t - test.t0;
          const id = TPMS_MAP[test.wheel];
          const drop = dt < 4 ? (dt / 4) * 45 : dt < 7 ? 45 : dt < 10 ? 45 * (1 - (dt - 7) / 3) : 0;
          const key = `tp${id}`;
          if (Number.isFinite(get(rt, key))) set(rt, key, get(rt, key) - drop);
          if (dt >= 4 && !(test.wheel in rt.tpms.tested)) {
            rt.tpms.tested[test.wheel] = id === 3 && !alive ? null : id;
            this.rev++;
          }
          if (dt > 10) this.endTest(rt);
        }
        break;
      }
      case 'acLow': {
        this.idle(rt, { rpm: 720 });
        set(rt, 'blower', 1);
        if (!fixed.has('acLeak')) {
          set(rt, 'acp', 0.15 + 0.004 * wob(t, k));
          set(rt, 'comp', 0);
          rt.s.evap = approach(rt.s.evap, 20.5, 0.02);
          rt.s.vent = approach(rt.s.vent, 21.5, 0.02);
        } else {
          const cyc = Math.sin(t * 0.32 + k);
          set(rt, 'comp', cyc > -0.85 ? 1 : 0);
          set(rt, 'acp', 1.32 + 0.14 * cyc + 0.01 * wob(t * 2, k));
          rt.s.evap = approach(rt.s.evap, 3 + 0.8 * cyc, 0.01);
          rt.s.vent = approach(rt.s.vent, 6.2 + 0.6 * cyc, 0.008);
        }
        set(rt, 'evap', rt.s.evap);
        set(rt, 'vent', rt.s.vent);
        break;
      }
      case 'ready': {
        this.off(rt, 12.62);
        break;
      }
    }
    if (rt.dtcs.some((d) => d.mil && d.status !== 'history') && rt.lamps.mil === 0) rt.lamps.mil = 1;
    if (rt.dtcs.some((d) => d.code === 'C2123' && d.status !== 'history')) rt.lamps.tpms = Math.max(rt.lamps.tpms, 2) as 0 | 1 | 2;
  }

  /** Road-test loop for the misfire car: 150 s around the dealership lot and the frontage road. */
  private drive(rt: Rt, misfire: boolean) {
    const t = this.t;
    const k = rt.phase;
    const c = t % 150;
    let vss = 0;
    let accp = 0;
    let brake = 0;
    let steer = 0;
    if (c < 8) brake = 1;
    else if (c < 25) {
      vss = ((c - 8) / 17) * 56;
      accp = 32;
    } else if (c < 60) {
      vss = 56 + 5 * Math.sin((c - 25) / 5);
      accp = 14;
    } else if (c < 76) {
      vss = 60 + ((c - 60) / 16) * 22;
      accp = 58;
    } else if (c < 110) {
      vss = 82 + 3 * Math.sin((c - 76) / 6);
      accp = 22;
    } else if (c < 125) {
      vss = 82 * (1 - (c - 110) / 15);
      brake = 1;
    } else if (c < 140) {
      vss = 20;
      accp = 10;
      steer = 92 * Math.sin(((c - 125) / 15) * Math.PI);
    } else {
      vss = 20 * (1 - (c - 140) / 4);
      brake = c > 141 ? 1 : 0;
      if (vss < 0) vss = 0;
    }
    vss = Math.max(0, vss);
    const grade = c >= 60 && c < 76 ? 12 : 0;
    const prev = rt.s.vss ?? 0;
    rt.s.vss = vss;
    const ax = ((vss - prev) / 3.6) * RATE;
    const rpmT = vss < 2 ? 760 : clamp(1100 + vss * 13 + accp * 14, 1100, 3200);
    rt.s.rpm = approach(rt.s.rpm, rpmT, 0.3);
    const load = clamp(17 + accp * 0.78 + grade + (brake ? -6 : 0), 12, 92);
    const mfTarget = misfire ? (load > 55 ? 24 : load > 38 ? 8 : 1.2) : 0;
    rt.s.mf = approach(rt.s.mf, mfTarget, 0.12);
    const rough = misfire && rt.s.mf > 10 ? 35 * Math.sin(t * 9.7 + k) : 0;
    const rpm = rt.s.rpm + 10 * wob(t * 1.4, k) + rough;
    set(rt, 'rpm', rpm);
    set(rt, 'nt', rpm * 0.97);
    set(rt, 'load', load + 1.2 * wob(t * 1.2, k));
    set(rt, 'maf', ((rpm * load) / 1000) * 0.16 + 0.1 * wob(t * 2, k));
    set(rt, 'map', 18 + load * 0.85);
    set(rt, 'tps', 12 + accp * 0.62);
    set(rt, 'accp', accp + 0.6 * wob(t * 1.8, k));
    set(rt, 'etq', load * 1.45 - 10);
    set(rt, 'timing', 31 - load * 0.26 + 1.2 * wob(t * 1.6, k));
    rt.s.ect = approach(rt.s.ect, 91.5, 0.004);
    set(rt, 'ect', rt.s.ect);
    set(rt, 'iat', 9 + 0.8 * wob(t * 0.04, k));
    set(rt, 'stft', 1.2 + 2.6 * Math.sin(t * 2.3 + k));
    set(rt, 'ltft', 2.3);
    set(rt, 'afs', 3.3 - 0.06 * Math.sin(t * 2.3 + k));
    set(rt, 'o2s2', 0.66 + 0.05 * wob(t * 0.5, k));
    const mfv = Math.max(0, rt.s.mf + (misfire ? 1.5 * wob(t * 3.1, k) : 0));
    set(rt, 'mf1', Math.round(mfv));
    set(rt, 'mf2', 0);
    set(rt, 'mf3', misfire && load > 60 && Math.sin(t * 0.7 + k) > 0.92 ? 1 : 0);
    set(rt, 'mf4', 0);
    set(rt, 'mfm', misfire ? clamp(72 - load * 0.75, 8, 80) : clamp(84 - load * 0.4, 40, 90));
    rt.s.run += DT;
    set(rt, 'runtime', rt.s.run);
    const vb = 14.05 + 0.06 * wob(t * 0.8, k);
    set(rt, 'modv', vb);
    set(rt, 'vbat', vb - 0.05);
    set(rt, 'gear', 0);
    set(rt, 'vss', vss);
    const yawRate = (((vss / 3.6) * Math.tan((steer / 14) * (Math.PI / 180))) / 2.7) * (180 / Math.PI);
    const turn = (yawRate * Math.PI) / 180;
    const inner = 1 - Math.min(0.06, Math.abs(turn) * 0.1);
    const outer = 1 + Math.min(0.06, Math.abs(turn) * 0.1);
    const left = steer > 0;
    set(rt, 'wsFL', vss * (left ? inner : outer) * 1.002);
    set(rt, 'wsFR', vss * (left ? outer : inner) * 0.999);
    set(rt, 'wsRL', vss * (left ? inner : outer) * 0.998);
    set(rt, 'wsRR', vss * (left ? outer : inner) * 1.001);
    set(rt, 'brake', brake);
    set(rt, 'steer', steer + 1.2 * wob(t * 0.9, k));
    set(rt, 'yaw', yawRate + 0.15 * wob(t * 1.7, k));
    set(rt, 'ax', clamp(ax, -6, 4) + 0.05 * wob(t * 3, k));
    set(rt, 'ay', (vss / 3.6) * turn + 0.04 * wob(t * 2.5, k));
    set(rt, 'epsTq', Math.round(steer * 1.6 + 6 * wob(t * 1.1, k)));
    set(rt, 'pbrake', 0);
    rt.s.odo += ((vss / 3600) * DT) / 1.609344;
    rt.engine = 'run';
    if (misfire) {
      rt.lamps.mil = rt.s.mf > 15 ? 2 : 1;
      if (rt.s.mf > 15 && (rt.s.mflog ?? 0) < t - 60) {
        rt.s.mflog = t;
        this.log(rt.id, 'error', `MIL blinking — cylinder 1 misfire under load (${Math.round(load)} %, ${Math.round(rpm)} rpm)`);
      }
    }
  }

  private battery(rt: Rt) {
    const t = this.t;
    const k = rt.phase;
    const test = rt.test;
    const good = rt.fixed.has('battery');
    if (test?.id === 'crank') {
      const dt = t - test.t0;
      const crankDur = good ? 1.6 : 3.1;
      if (dt < crankDur) {
        const lo = good ? 10.7 : 8.9;
        const samples: number[] = [];
        for (let i = 0; i < 5; i++) {
          const tt = dt + i * 0.02;
          const inrush =
            tt < 0.12 ? (good ? 9.6 : 7.9) : lo + (good ? 0.35 : 0.45) * Math.abs(Math.sin(tt * 21 + k)) + (tt / crankDur) * 0.15;
          samples.push(inrush);
        }
        if (!rt.crank || rt.crank.after !== test.t0) rt.crank = { min: 99, dur: crankDur, samples: [], after: test.t0 };
        rt.crank.samples.push(...samples);
        // Ignore the first ~0.1 s starter inrush, as battery testers do; keep the sustained cranking voltage.
        const steady = samples.filter((_, i) => dt + i * 0.02 > 0.12);
        if (steady.length) rt.crank.min = Math.min(rt.crank.min, ...steady);
        for (const id of ['load', 'maf', 'tps', 'accp', 'etq', 'stft', 'runtime']) set(rt, id, 0);
        set(rt, 'rpm', 190 + 25 * Math.sin(t * 13));
        set(rt, 'nt', 0);
        set(rt, 'vbat', samples[4]);
        set(rt, 'modv', samples[4] - 0.1);
        set(rt, 'ect', rt.s.ect);
        rt.engine = 'crank';
        rt.lamps.abs = !good;
        rt.lamps.slip = !good;
        return;
      }
      if (rt.crank && rt.crank.samples.length < 300) {
        const tail = Math.min(10, 300 - rt.crank.samples.length);
        for (let i = 0; i < tail; i++) rt.crank.samples.push(13.6 + 0.4 * (i / tail));
      }
      if (rt.engine !== 'run') {
        rt.s.rpm = 1450;
        this.log(rt.id, good ? 'ok' : 'warn', `Crank test: ${(rt.crank?.min ?? 0).toFixed(1)} V minimum over ${crankDur.toFixed(1)} s`);
        this.rev++;
      }
      this.idle(rt, { rpm: 1000 - Math.min(1, (dt - crankDur) / 6) * 240 });
      set(rt, 'vbat', 14.35 + 0.05 * wob(t, k));
      set(rt, 'modv', 14.3 + 0.05 * wob(t, k));
      if (dt > crankDur + 6) this.endTest(rt);
      return;
    }
    if (rt.engine === 'run' && test?.id !== 'keyOff') {
      this.idle(rt, { rpm: 760 });
      return;
    }
    rt.s.vb = good ? 12.66 : Math.max(11.92, rt.s.vb - 0.00006);
    this.off(rt, rt.s.vb);
  }

  // ───────────── tests ─────────────
  startTest(id: string, test: TestId, arg?: number, wheel?: string) {
    const rt = this.byId[id];
    if (!rt) return;
    rt.test = { id: test, t0: this.t, arg, wheel };
    const label: Record<TestId, string> = {
      hold2500: 'Holding 2,500 rpm (helper at the pedal)',
      afInj: `Active test: injection volume ${arg && arg > 0 ? '+12.5 %' : arg && arg < 0 ? '−12.5 %' : '0 %'}`,
      crank: 'Recording crank & start at 50 samples/s',
      deflate: `Deflating ${wheel} tire 40 kPa`,
      keyOff: 'Ignition off',
    };
    this.log(id, 'info', label[test]);
    if (test === 'keyOff') {
      rt.engine = 'off';
      rt.test = null;
    }
    this.bump();
  }
  endTest(rt: Rt) {
    rt.test = null;
    this.rev++;
  }

  // ───────────── sessions ─────────────
  setMode(id: string, mode: Mode) {
    const rt = this.byId[id];
    rt.mode = mode;
    this.log(
      id,
      'info',
      mode === 'listen' ? `${rt.v.adapter.id} set to listen-only — no frames transmitted` : `${rt.v.adapter.id} read session opened`,
    );
    this.bump();
  }
  requestControl(id: string) {
    const rt = this.byId[id];
    if (rt.holder === YOU) return;
    rt.handoff = this.t + 1.4;
    this.log(id, 'info', `Control requested from ${rt.holder}`);
    this.bump();
  }
  releaseControl(id: string) {
    const rt = this.byId[id];
    rt.holder = rt.v.tech === YOU ? 'Unassigned' : rt.v.tech;
    this.log(id, 'info', 'You released control');
    this.bump();
  }

  // ───────────── scans & codes ─────────────
  scan(id: string) {
    const rt = this.byId[id];
    if (rt.mode === 'listen') {
      for (const k of Object.keys(rt.ecu)) rt.ecu[k] = { status: 'skipped', dtcs: 0 };
      this.log(id, 'warn', 'Health check skipped: adapter is listen-only');
      this.bump();
      return;
    }
    const order = ecusFor(rt.v.preset)
      .filter((e) => e.path === 'direct')
      .map((e) => e.node);
    rt.scan = { state: 'run', i: 0, next: this.t + 0.3, order };
    for (const k of Object.keys(rt.ecu)) rt.ecu[k] = { status: 'idle', dtcs: 0 };
    this.bump();
  }
  scanAll() {
    for (const rt of this.rts) this.scan(rt.id);
    this.log('all', 'info', 'Health check started on every connected vehicle');
  }
  private runScan(rt: Rt) {
    if (rt.scan.state !== 'run' || this.t < rt.scan.next) return;
    const node = rt.scan.order[rt.scan.i];
    if (node) {
      const cur = rt.ecu[node];
      if (cur.status !== 'querying') {
        rt.ecu[node] = { status: 'querying', dtcs: 0 };
        rt.scan.next = this.t + (node === 'skid' && this.skidOut(rt) ? 1.5 : 0.25 + ((rt.phase * 7 + rt.scan.i * 3) % 5) * 0.08);
      } else {
        const none = node === 'skid' && this.skidOut(rt);
        const dtcs = rt.dtcs.filter((d) => d.ecu === node && d.status !== 'history').length;
        rt.ecu[node] = { status: none ? 'none' : 'ok', dtcs, at: this.t };
        rt.scan.i++;
        rt.scan.next = this.t + 0.05;
      }
      this.rev++;
      return;
    }
    // gateway-reached modules take their status from the gateway's answer
    for (const e of ecusFor(rt.v.preset).filter((x) => x.path === 'gateway')) {
      const via = e.via && rt.ecu[e.via] ? rt.ecu[e.via].status : 'ok';
      const dtcs = rt.dtcs.filter((d) => d.ecu === e.node && d.status !== 'history').length;
      rt.ecu[e.node] = { status: via === 'none' ? 'none' : 'ok', dtcs, at: this.t };
    }
    rt.scan = { ...rt.scan, state: 'done', doneAt: this.t };
    const silent = Object.values(rt.ecu).filter((e) => e.status === 'none').length;
    const codes = rt.dtcs.filter((d) => d.status !== 'history').length;
    this.log(
      rt.id,
      silent ? 'error' : codes ? 'warn' : 'ok',
      `Health check: ${silent ? `${silent} module not responding, ` : ''}${codes} active code${codes === 1 ? '' : 's'}`,
    );
    this.rev++;
  }
  skidOut(rt: Rt) {
    return rt.v.scenario === 'canSkid' && !rt.fixed.has('branch');
  }

  clearCodes(id: string) {
    const rt = this.byId[id];
    const cleared = rt.dtcs.length;
    rt.dtcs = [];
    rt.returns = [];
    const sc = rt.v.scenario;
    const back = (code: string, ecu: string, after: number, status: DtcStatus) =>
      rt.returns.push({ code, ecu, at: this.t + after, status });
    if (sc === 'canSkid' && !rt.fixed.has('branch'))
      ['ecm', 'eps', 'meter', 'nav'].forEach((e, i) => back('U0129', e, 2.3 + i * 0.1, 'confirmed'));
    if (sc === 'misfire' && !rt.fixed.has('plugs')) back('P0301', 'ecm', 24, 'pending');
    if (sc === 'lean' && !rt.fixed.has('pcv')) back('P0171', 'ecm', 45, 'pending');
    if (sc === 'acLow' && !rt.fixed.has('acLeak')) back('B1423', 'ac', 3, 'confirmed');
    for (const k of Object.keys(rt.ecu)) if (rt.ecu[k].status === 'ok') rt.ecu[k].dtcs = 0;
    this.log(
      id,
      'info',
      `Cleared ${cleared} code${cleared === 1 ? '' : 's'}${sc === 'tpms' && !rt.tpms.registered ? ' — C2123 will return after 20 min above 23 mph' : ''}`,
    );
    this.bump();
  }
  private runReturns(rt: Rt) {
    if (!rt.returns.length) return;
    const due = rt.returns.filter((r) => this.t >= r.at);
    if (!due.length) return;
    rt.returns = rt.returns.filter((r) => this.t < r.at);
    for (const r of due) {
      rt.dtcs.push({ code: r.code, ecu: r.ecu, status: r.status, mil: r.code.startsWith('P'), miles: Math.round(rt.s.odo) });
    }
    this.log(rt.id, 'warn', `${due[0].code} returned (${due[0].status}) — the fault is still present`);
    this.rev++;
  }

  applyFix(id: string, fix: FixId) {
    const rt = this.byId[id];
    rt.fixed.add(fix);
    const text: Record<FixId, string> = {
      plugs: 'Repair recorded: four spark plugs replaced',
      pcv: 'Repair recorded: PCV hose replaced',
      branch: 'Repair recorded: A41 CAN branch repaired — skid control ECU back on the bus',
      battery: 'Repair recorded: 12 V battery replaced',
      tpms: 'Repair recorded: RR valve & transmitter replaced (ID not registered yet)',
      acLeak: 'Repair recorded: condenser replaced; system evacuated and charged',
    };
    if (fix === 'branch') {
      rt.msgs = presentMessages(rt.v, false);
      rt.dtcs = rt.dtcs.map((d) => (d.code === 'U0129' ? { ...d, status: 'history' } : d));
      if (rt.ecu.skid) rt.ecu.skid = { status: 'idle', dtcs: 0 };
    }
    if (fix === 'acLeak') rt.dtcs = rt.dtcs.map((d) => (d.code === 'B1423' ? { ...d, status: 'history' } : d));
    if (fix === 'plugs' || fix === 'pcv') rt.dtcs = rt.dtcs.map((d) => (d.code.startsWith('P0') ? { ...d, status: 'history' } : d));
    rt.returns = [];
    this.log(id, 'ok', text[fix]);
    this.bump();
  }

  // ───────────── guided procedure hooks ─────────────
  runStep(id: string, procId: string, step: ProcStep, manual?: 'ok' | 'ng'): StepResult {
    const rt = this.byId[id];
    const key = `${procId}.${step.key}`;
    const r = this.evaluate(rt, step, manual);
    if (r.result !== 'wait') rt.steps[key] = r;
    this.bump();
    return r;
  }
  resetProcedure(id: string, procId: string) {
    const rt = this.byId[id];
    for (const k of Object.keys(rt.steps)) if (k.startsWith(procId + '.')) delete rt.steps[k];
    this.bump();
  }

  private evaluate(rt: Rt, step: ProcStep, manual?: 'ok' | 'ng'): StepResult {
    const f = rt.fixed;
    const active = rt.dtcs.filter((d) => d.status !== 'history');
    const v = (sid: string) => get(rt, sid);
    switch (step.hook) {
      case 'info':
        return { result: 'next', reading: '' };
      case 'manual':
        return { result: manual ?? 'ok', reading: manual === 'ng' ? 'Marked NG by technician' : 'Checked — OK' };
      case 'otherDtcs': {
        if (rt.mode === 'listen')
          return { result: 'wait', reading: 'Open a read session first — reading codes needs the adapter to transmit.' };
        const codes = [...new Set(active.map((d) => d.code))];
        return { result: 'ok', reading: codes.length ? `Stored: ${codes.join(', ')} — no other codes` : 'No codes stored in any ECU' };
      }
      case 'pcvHose':
        return rt.v.scenario === 'lean' && !f.has('pcv')
          ? { result: 'ng', reading: 'Crack at the intake-manifold elbow; hissing at idle, trims drop when the crack is pinched' }
          : { result: 'ok', reading: 'Hoses connected, no cracks' };
      case 'freezeMisfire':
        return { result: 'next', reading: 'Misfire RPM 2,480 rpm · Misfire Load 68 % (from the stored freeze frame)' };
      case 'misfireCounts': {
        const mx = (sid: string) => Math.max(0, ...Array.from(this.series(rt, sid, 600)).filter(Number.isFinite));
        const c = [mx('mf1'), mx('mf2'), mx('mf3'), mx('mf4')];
        if (c.every((x) => x < 3))
          return { result: 'wait', reading: 'No misfires seen in the last minute — drive at the recorded RPM and load, then read again.' };
        return {
          result: 'ok',
          reading: `Peak counts in the last minute — #1: ${c[0]}, #2: ${c[1]}, #3: ${c[2]}, #4: ${c[3]}. Cylinder 1 dominates.`,
        };
      }
      case 'plugInspect':
        return f.has('plugs')
          ? { result: 'ok', reading: 'New plugs installed' }
          : { result: 'ng', reading: 'Cylinder 1: cracked insulator with carbon tracking; electrodes worn on all four plugs' };
      case 'confirmCodes': {
        const procCodes =
          rt.v.scenario === 'canSkid'
            ? ['U0129']
            : rt.v.scenario === 'misfire'
              ? ['P0301']
              : rt.v.scenario === 'lean'
                ? ['P0171']
                : rt.v.scenario === 'acLow'
                  ? ['B1423']
                  : rt.v.scenario === 'tpms'
                    ? ['C2123']
                    : [];
        const left = rt.dtcs.filter((d) => procCodes.includes(d.code));
        if (left.length)
          return {
            result: 'wait',
            reading: `${left.length} matching code${left.length > 1 ? 's' : ''} still stored — clear codes (needs control), then confirm.`,
          };
        if (rt.returns.length) return { result: 'wait', reading: 'Waiting to see whether the code returns…' };
        const ok =
          (rt.v.scenario === 'canSkid' && f.has('branch')) ||
          (rt.v.scenario === 'misfire' && f.has('plugs')) ||
          (rt.v.scenario === 'lean' && f.has('pcv')) ||
          (rt.v.scenario === 'acLow' && f.has('acLeak'));
        return ok
          ? { result: 'ok', reading: 'Codes cleared and not returning. Repair confirmed.' }
          : { result: 'ng', reading: 'The fault is still present — the code will return.' };
      }
      case 'canCheck': {
        if (rt.scan.state === 'run')
          return { result: 'wait', reading: 'CAN bus check in progress — the result appears when every module has been asked.' };
        if (rt.scan.state !== 'done') {
          this.scan(rt.id);
          return { result: 'wait', reading: 'Running the CAN bus check…' };
        }
        const direct = ecusFor(rt.v.preset).filter((e) => e.path === 'direct');
        const ans = direct.filter((e) => rt.ecu[e.node]?.status === 'ok').length;
        const silent = direct.filter((e) => rt.ecu[e.node]?.status === 'none').map((e) => e.name);
        return {
          result: 'next',
          reading: `${ans} of ${direct.length} V-bus ECUs answered${silent.length ? ` · missing: ${silent.join(', ')}` : ''}`,
        };
      }
      case 'skidDtc':
        return this.skidOut(rt)
          ? {
              result: 'ok',
              reading: 'No answer on 0x7B0 → 0x7B8, so C1241 cannot be read. Treated as not output (assumption flagged by the console).',
            }
          : { result: 'ok', reading: 'C1241 not output' };
      case 'probeA41':
        return this.skidOut(rt)
          ? { result: 'ng', reading: 'A41-25 ↔ A41-14: OL (open) — spec 54–69 Ω' }
          : { result: 'ok', reading: 'A41-25 ↔ A41-14: 60 Ω — within 54–69 Ω' };
      case 'batteryRest': {
        if (rt.engine !== 'off') return { result: 'wait', reading: 'Turn the engine off to read resting voltage.' };
        const vb = v('vbat');
        return {
          result: vb >= 11 && vb <= 14 ? 'ok' : 'ng',
          reading: `${vb.toFixed(2)} V with the engine off (spec 11–14 V)${vb < 12.3 ? ' — passes, but low for a rested battery' : ''}`,
        };
      }
      case 'crankTest': {
        const c = rt.crank;
        if (!c || (step.key === 'b5' && !f.has('battery')))
          return { result: 'wait', reading: 'Run “Crank & start” to capture the voltage.' };
        if (step.key === 'b5' && c.min < 10) return { result: 'wait', reading: 'Run the crank test again with the new battery.' };
        return {
          result: c.min < 9.5 ? 'ng' : 'ok',
          reading: `Minimum ${c.min.toFixed(2)} V over a ${c.dur.toFixed(1)} s crank${c.min < 9.5 ? ' — below the 9.5 V C1241 threshold' : ' — healthy'}`,
        };
      }
      case 'batteryTester':
        return f.has('battery')
          ? { result: 'ok', reading: 'Good battery' }
          : { result: 'ng', reading: 'Replace battery — 58 % of rated cold-cranking amps (sample tester output)' };
      case 'charging': {
        if (rt.engine !== 'run') return { result: 'wait', reading: 'Start the engine (run the crank test) to check charging voltage.' };
        const vb = v('vbat');
        return { result: vb > 13.5 ? 'ok' : 'ng', reading: `${vb.toFixed(2)} V at idle — charging system is working` };
      }
      case 'tpmsDrop': {
        const tested = rt.tpms.tested;
        const wheels = ['LF', 'RF', 'LR', 'RR'];
        const missing = wheels.filter((w) => !(w in tested));
        if (missing.length)
          return { result: 'wait', reading: `Deflate each tire with the buttons below — remaining: ${missing.join(', ')}` };
        const dead = wheels.find((w) => tested[w] === null);
        return {
          result: 'next',
          reading:
            wheels.map((w) => `${w} → ${tested[w] === null ? 'no change' : `ID ${tested[w]}`}`).join(' · ') +
            (dead ? ` ⇒ the ${dead} transmitter is ID 3` : ''),
        };
      }
      case 'tpmsIds':
        return {
          result: 'ok',
          reading: `Registered ID 3 Code ${TPMS_IDS[3]} · RR transmitter label ${TPMS_IDS[3]} → IDs match, so the transmitter itself has stopped sending`,
        };
      case 'tpmsRegister':
        if (!f.has('tpms')) return { result: 'wait', reading: 'Record the transmitter replacement first.' };
        if (rt.holder !== YOU)
          return { result: 'wait', reading: 'Registration writes to the TPMS ECU — take control of this vehicle first.' };
        rt.tpms.registered = true;
        return { result: 'next', reading: 'New ID 3 Code 3F07B2E written to the TPMS ECU' };
      case 'tpmsInit':
        if (!rt.tpms.registered) return { result: 'wait', reading: 'Register the new ID first.' };
        if (rt.holder !== YOU) return { result: 'wait', reading: 'Initialization needs control of this vehicle.' };
        rt.tpms.initialized = true;
        rt.dtcs = rt.dtcs.map((d) => (d.code === 'C2123' ? { ...d, status: 'history' } : d));
        return { result: 'next', reading: 'Initialization complete — the warning light blinked 3 times' };
      case 'tpmsConfirm': {
        const vals = [1, 2, 3, 4].map((i) => v(`tp${i}`));
        if (vals.some((x) => !Number.isFinite(x))) return { result: 'wait', reading: 'ID 3 still has no reading.' };
        return { result: 'ok', reading: vals.map((x, i) => `ID ${i + 1}: ${(x * 0.1450377).toFixed(1)} psi`).join(' · ') };
      }
      case 'acPre':
        return f.has('acLeak')
          ? { result: 'ok', reading: 'E37-9 (PRE): 1.92 V — within 0.74–4.62 V' }
          : { result: 'ng', reading: 'E37-9 (PRE): 0.61 V — below 0.74 V (low refrigerant pressure)' };
      case 'acVacuum':
        return f.has('acLeak')
          ? { result: 'ok', reading: 'Vacuum holds' }
          : {
              result: 'ng',
              reading: 'Vacuum decays from −100 kPa to −62 kPa in 10 min — leak. UV dye traces at the condenser lower inlet.',
            };
      case 'acCharge':
        return f.has('acLeak')
          ? { result: 'next', reading: 'Evacuated and charged to the specified amount' }
          : { result: 'wait', reading: 'Record the leak repair first.' };
    }
  }

  // ───────────── frames for the bus monitor ─────────────
  setMonitor(id: string | null) {
    if (this.monitor === id) return;
    this.monitor = id;
    this.trace = [];
    this.idStats.clear();
    this.acc.clear();
  }

  /** Current payload for one broadcast frame (also used by the raw-frame widget). */
  payload(rt: Rt, m: CanMessage): number[] {
    const v = (id: string) => {
      const x = get(rt, id);
      return Number.isFinite(x) ? x : 0;
    };
    const cnt = (this.counters.get(m.id) ?? 0) & 0xff;
    let vals: Record<string, number> | null = null;
    switch (m.id) {
      case 0x024:
        vals = { YAW_RATE: v('yaw'), ACCEL_X: v('ax'), ACCEL_Y: v('ay') };
        break;
      case 0x025:
        vals = { STEER_ANGLE: v('steer'), STEER_RATE: 0, STEER_FRACTION: 0 };
        break;
      case 0x0aa:
        vals = { WHEEL_SPEED_FL: v('wsFL'), WHEEL_SPEED_FR: v('wsFR'), WHEEL_SPEED_RL: v('wsRL'), WHEEL_SPEED_RR: v('wsRR') };
        break;
      case 0x0b4:
        vals = { SPEED: v('vss'), ENCODER: cnt };
        break;
      case 0x1c4:
        vals = { RPM: v('rpm'), ENGINE_RUNNING: v('rpm') > 300 ? 1 : 0, MILREQ: rt.lamps.mil ? 1 : 0 };
        break;
      case 0x1d0:
        vals = { NT: v('nt') };
        break;
      case 0x1d3:
        vals = { BRAKE_PRESSED: v('brake'), MAIN_ON: 0, SET_SPEED: 0 };
        break;
      case 0x224:
        vals = { BRAKE_PRESSED: v('brake'), BRAKE_PRESSURE: v('brake') ? 310 : 0 };
        break;
      case 0x260:
        vals = { STEER_TORQUE_DRIVER: v('epsTq'), STEER_ANGLE: v('steer'), STEER_TORQUE_EPS: Math.round(v('epsTq') * 0.6) };
        break;
      case 0x2c1:
        vals = { ETQREAL: v('etq'), EACCP: v('accp') };
        break;
      case 0x320:
        vals = { FABS: 0, BRKON: v('brake') };
        break;
      case 0x380:
        vals = { ECOSW: 0, BLWON: v('blower'), FAN_AC: v('comp') ? 1 : 0 };
        break;
      case 0x3b0:
        vals = { RDEF: 0, MHTR: 0, ACN_AMB: Math.max(0, Math.round(v('amb'))) };
        break;
      case 0x3b7:
        vals = { B_BRKW: rt.lamps.brake ? 1 : 0, B_ABS: rt.lamps.abs ? 1 : 0, SLP_WL: rt.lamps.slip ? 1 : 0, VSCOFF: 0, TRCOFF: 0 };
        break;
      case 0x3bc:
        vals = { GEAR: v('gear'), DRIVE_ENGAGED: v('gear') === 0 ? 1 : 0 };
        break;
      case 0x3d3:
        vals = { B_FC: (cnt * 3) % 60 };
        break;
      case 0x610:
        vals = { METER_SLIDER_BRIGHTNESS_PCT: 100, METER_SLIDER_DIMMED: 0 };
        break;
      case 0x611:
        vals = { ODOMETER: Math.round(rt.s.odo * 1.609344) };
        break;
      case 0x620:
        vals = {
          DOOR_OPEN_FL: v('doorFL'),
          DOOR_OPEN_FR: 0,
          DOOR_OPEN_RL: 0,
          DOOR_OPEN_RR: 0,
          PARKING_BRAKE: v('pbrake'),
          SEATBELT_DRIVER_UNLATCHED: v('belt'),
        };
        break;
      case 0x622:
        vals = { LOW_BEAM: v('lowBeam'), TAIL_LIGHT: v('lowBeam'), HIGH_BEAM: 0, DAYTIME_RUNNING_LIGHT: v('lowBeam') ? 0 : 1 };
        break;
      case 0x638:
        vals = { LOCK_STATUS: 0, LOCKED_VIA_KEYFOB: 0 };
        break;
    }
    let data: number[];
    if (vals && m.signals) {
      data = encode(m.dlc, m.signals, vals);
      if (m.signals.some((s) => s.name === 'CHECKSUM')) data[m.dlc - 1] = toyotaChecksum(m.id, data);
    } else {
      // Layout not public: stable placeholder bytes with a rolling counter in the last byte.
      data = Array.from({ length: m.dlc }, (_, i) => ((m.id * 31 + i * 57 + (i === 0 ? rt.phase * 10 : 0)) & 0xff) >>> 0);
      if (m.dlc > 1 && m.id % 3 === 0) data[m.dlc - 1] = cnt;
    }
    return data;
  }

  private frames(rt: Rt) {
    const ms = Math.round(this.t * 1000);
    for (const m of rt.msgs) {
      const p = periodOf(m);
      let a = (this.acc.get(m.id) ?? Math.random()) + 100 / p;
      const n = Math.floor(a);
      a -= n;
      this.acc.set(m.id, a);
      if (!n) continue;
      this.counters.set(m.id, ((this.counters.get(m.id) ?? 0) + n) & 0xff);
      const data = this.payload(rt, m);
      const st = this.idStats.get(m.id);
      if (st) {
        const changed = data.map((b, i) => (b !== st.data[i] ? ms : (st.changedAt[i] ?? 0)));
        st.prev = st.data;
        st.data = data;
        st.count += n;
        st.t = ms;
        st.changedAt = changed;
      } else this.idStats.set(m.id, { id: m.id, count: n, data, prev: data, t: ms, period: p, changedAt: data.map(() => 0) });
      const keep = Math.min(n, 2);
      for (let i = 0; i < keep; i++) this.trace.push({ t: ms - (keep - 1 - i) * p, id: m.id, data });
    }
    if (rt.mode === 'read' && rt.engine !== 'crank') {
      const pids = [0x05, 0x0c, 0x0d, 0x04, 0x10, 0x06, 0x07, 0x42, 0x0f, 0x11];
      const p = pids[this.pidIdx++ % pids.length];
      const sigFor: Record<number, string> = {
        0x05: 'ect',
        0x0c: 'rpm',
        0x0d: 'vss',
        0x04: 'load',
        0x10: 'maf',
        0x06: 'stft',
        0x07: 'ltft',
        0x42: 'modv',
        0x0f: 'iat',
        0x11: 'tps',
      };
      const raw = get(rt, sigFor[p]);
      const bytes = pidBytes(p, Number.isFinite(raw) ? raw : 0);
      const req = [0x02, 0x01, p, 0, 0, 0, 0, 0];
      const res = [2 + bytes.length, 0x41, p, ...bytes];
      while (res.length < 8) res.push(0);
      this.trace.push({ t: ms + 2, id: 0x7e0, data: req, tx: true });
      this.trace.push({ t: ms + 6, id: 0x7e8, data: res });
      for (const [id, data] of [
        [0x7e0, req],
        [0x7e8, res],
      ] as [number, number[]][]) {
        const st = this.idStats.get(id);
        if (st) {
          st.changedAt = data.map((b, i) => (b !== st.data[i] ? ms : (st.changedAt[i] ?? 0)));
          st.prev = st.data;
          st.data = data;
          st.count++;
          st.t = ms;
        } else this.idStats.set(id, { id, count: 1, data, prev: data, t: ms, period: 100, changedAt: data.map(() => 0) });
      }
    }
    if (this.trace.length > 600) this.trace.splice(0, this.trace.length - 600);
  }
}

export const sim = new Sim();
