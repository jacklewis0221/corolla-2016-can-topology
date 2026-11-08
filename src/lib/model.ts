import { NODES, NODE_BY_ID, isPresent, type NetNode, type Option } from '../data/nodes';
import { EDGES, EDGE_BY_ID, MEDIUM_LAYER, type Edge, type Layer, type Medium, type Pt } from '../data/edges';
import { harnessCurve, labelWidth, polyLength, resample, roundedPath, spreadWidths } from './geometry';

export type Opts = Record<Option, boolean>;
export type Layers = Record<Layer, boolean>;

export const PRESETS: Record<'base' | 'plus' | 'eco', { label: string; detail: string; opts: Opts }> = {
  base: { label: 'Base LE', detail: 'Key start, Entune Audio, no sunroof', opts: { smartKey: false, nav: false, roof: false, eco: false } },
  plus: { label: 'LE Plus + Convenience pkg', detail: 'Smart key & push start, navigation, sliding roof', opts: { smartKey: true, nav: true, roof: true, eco: false } },
  eco: { label: 'LE Eco', detail: '2ZR-FAE Valvematic engine with a local CAN bus', opts: { smartKey: false, nav: false, roof: false, eco: true } },
};

export const ALL_LAYERS: Layers = { can: true, lin: true, serial: true, wire: true, rfvideo: true };

export function presentNodes(opts: Opts): NetNode[] {
  return NODES.filter((n) => isPresent(n, opts));
}

export function presentEdges(opts: Opts): Edge[] {
  return EDGES.filter((e) => isPresent(e, opts) && isPresent(NODE_BY_ID[e.from], opts) && isPresent(NODE_BY_ID[e.to], opts));
}

export interface EdgeGeom {
  sPts: Pt[];
  sD: string;
  pPts: Pt[];
  pD: string;
  sLen: number;
  pLen: number;
}

const geomCache = new Map<string, EdgeGeom>();

export function edgeGeom(e: Edge): EdgeGeom {
  const hit = geomCache.get(e.id);
  if (hit) return hit;
  const a = NODE_BY_ID[e.from].pos.p;
  const b = NODE_BY_ID[e.to].pos.p;
  const bend = e.medium === 'can' || e.medium === 'local' ? 0.08 : e.medium === 'rf' ? 0.22 : 0.16;
  const curve = harnessCurve(a, b, bend);
  const g: EdgeGeom = {
    sPts: resample(e.route),
    sD: roundedPath(e.route, 14),
    pPts: resample(curve.pts),
    pD: curve.d,
    sLen: polyLength(e.route),
    pLen: polyLength(curve.pts),
  };
  geomCache.set(e.id, g);
  return g;
}

export function edgePoints(e: Edge, t: number): Pt[] {
  const g = edgeGeom(e);
  if (t <= 0.001) return g.sPts;
  if (t >= 0.999) return g.pPts;
  return g.sPts.map((p, i) => [p[0] + (g.pPts[i][0] - p[0]) * t, p[1] + (g.pPts[i][1] - p[1]) * t] as Pt);
}

export function nodeLabel(n: NetNode): string {
  return n.short.split(' · ')[0];
}

export function subline(n: NetNode): string {
  if (n.kind === 'junction') return n.id === 'jc1' ? 'A35 · A36 · A37' : n.id === 'jc2' ? 'A39' : 'E55 · passive splice block';
  const v = n.can?.find((c) => c.bus === 'V bus');
  if (v) return `${v.connector} · ${v.canh.split(' ')[0]}/${v.canl.split(' ')[0]}`;
  const l = n.can?.find((c) => c.bus === 'Local CAN');
  if (l) return `${l.connector} · local CAN`;
  switch (n.id) {
    case 'pwm':
      return 'LIN · H9-9';
    case 'roof':
      return 'LIN · O6-11';
    case 'acpanel':
      return 'LIN · E16-6';
    case 'idbox':
      return 'LIN · E56-2';
    case 'slock':
      return 'LIN · E61-5';
    case 'gen':
      return 'LIN · B37-1';
    case 'immo':
      return 'E25 · K-line';
    case 'ods':
      return 'S2 · K-line';
    case 'rcv':
      return 'L25 · PRG/RDA';
    case 'tpms':
      return 'PRG/RDA serial';
    case 'camera':
      return 'L35 · video';
    case 'fob':
      return 'radio';
    case 'valves':
      return 'radio';
    default:
      return '';
  }
}

/** Width of an in-car callout label box (dot + text + padding). */
export function calloutWidth(label: string): number {
  return Math.ceil(labelWidth(label, 15) + 40);
}

/** Callout label positions for the in-car view. */
export function calloutLayout(nodes: NetNode[]): Record<string, { x: number; y: number; top: boolean }> {
  const out: Record<string, { x: number; y: number; top: boolean }> = {};
  const top = nodes.filter((n) => n.pos.p[1] < 498).sort((a, b) => a.pos.p[0] - b.pos.p[0]);
  const bottom = nodes.filter((n) => n.pos.p[1] >= 498).sort((a, b) => a.pos.p[0] - b.pos.p[0]);
  const place = (list: NetNode[], rows: [number, number], isTop: boolean) => {
    for (let r = 0; r < 2; r++) {
      const row = list.filter((_, i) => i % 2 === r);
      const xs = spreadWidths(
        row.map((n) => n.pos.p[0]),
        row.map((n) => calloutWidth(nodeLabel(n))),
        14,
        16,
        1584,
      );
      row.forEach((n, i) => (out[n.id] = { x: xs[i], y: rows[r], top: isTop }));
    }
  };
  place(top, [184, 120], true);
  place(bottom, [818, 882], false);
  return out;
}

// ───────────────────────── packet simulation ─────────────────────────

export interface Packet {
  key: string;
  edge: string;
  reverse: boolean;
  start: number; // ms (performance.now based)
  dur: number;
  medium: Medium;
  label?: string;
}

export interface Pulse {
  key: string;
  node: string;
  start: number;
  kind: 'send' | 'receive';
}

const SPEED = 0.95; // drawing units per ms (schematic)

let seq = 0;
const nextKey = () => `k${++seq}`;

/** Schedule a CAN broadcast: the frame ripples outward from the sender through the junctions. */
export function scheduleBroadcast(
  from: string,
  edges: Edge[],
  now: number,
  opts: { bus?: 'v' | 'local'; label?: string; to?: string[]; t?: number } = {},
): { packets: Packet[]; pulses: Pulse[]; endsAt: number } {
  const want: Medium = opts.bus === 'local' ? 'local' : 'can';
  const busEdges = edges.filter((e) => e.medium === want);
  const adj = new Map<string, { e: Edge; other: string }[]>();
  for (const e of busEdges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ e, other: e.to });
    adj.get(e.to)!.push({ e, other: e.from });
  }
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  const packets: Packet[] = [];
  const seen = new Set<string>();
  const mix = opts.t ?? 0;
  while (queue.length) {
    // simple Dijkstra-ish: pop smallest distance
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const cur = queue.shift()!;
    for (const { e, other } of adj.get(cur) ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const g = edgeGeom(e);
      const len = g.sLen * (1 - mix) + g.pLen * mix;
      const dur = Math.max(260, len / SPEED);
      const t0 = dist.get(cur)!;
      packets.push({
        key: nextKey(),
        edge: e.id,
        reverse: e.from !== cur,
        start: now + t0,
        dur,
        medium: e.medium,
        label: cur === from ? opts.label : undefined,
      });
      if (!dist.has(other) || dist.get(other)! > t0 + dur) {
        dist.set(other, t0 + dur);
        if (!queue.includes(other)) queue.push(other);
      }
    }
  }
  const pulses: Pulse[] = [{ key: nextKey(), node: from, start: now, kind: 'send' }];
  for (const id of opts.to ?? []) {
    const d = dist.get(id);
    if (d !== undefined) pulses.push({ key: nextKey(), node: id, start: now + d, kind: 'receive' });
  }
  const endsAt = now + Math.max(0, ...[...dist.values()]);
  return { packets, pulses, endsAt };
}

export function scheduleHop(edgeId: string, reverse: boolean, now: number, t = 0): { packets: Packet[]; pulses: Pulse[]; endsAt: number } {
  const e = EDGE_BY_ID[edgeId];
  const g = edgeGeom(e);
  const len = g.sLen * (1 - t) + g.pLen * t;
  const slow = e.medium === 'lin' || e.medium === 'serial' ? 0.55 : 1;
  const dur = Math.max(420, len / (SPEED * slow));
  const to = reverse ? e.from : e.to;
  const from = reverse ? e.to : e.from;
  return {
    packets: [{ key: nextKey(), edge: edgeId, reverse, start: now, dur, medium: e.medium }],
    pulses: [
      { key: nextKey(), node: from, start: now, kind: 'send' },
      { key: nextKey(), node: to, start: now + dur, kind: 'receive' },
    ],
    endsAt: now + dur,
  };
}

export function layerOn(e: Edge, layers: Layers) {
  return layers[MEDIUM_LAYER[e.medium]];
}
