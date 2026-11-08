import { Vector3 } from 'three';
import { NODE_BY_ID, type NetNode } from '../data/nodes';
import type { Edge } from '../data/edges';
import { AXLE_R, DIM, HALF_W, WHEELS, fromDrawing } from './dims';
import { arc, hash01, roundedPolyline, type V3 } from './math';

/*
 * Where each module sits in 3D. X/Z start from the in-car drawing (itself taken from Toyota's
 * parts-location drawings) and are mapped to car coordinates; heights come from each part's
 * documented location (instrument panel, floor, door, roof, engine compartment …). Positions are
 * approximate — close enough to show which zone of the car a module lives in.
 */

type Zone = 'bay' | 'dash' | 'floor' | 'door' | 'roof' | 'rear' | 'trunk' | 'outside';

interface PlaceSpec {
  y: number;
  x?: number;
  z?: number;
  zone: Zone;
  attach?: string;
}

const SPEC: Record<string, PlaceSpec> = {
  ecm: { y: 0.8, zone: 'bay', attach: 'BL' },
  skid: { y: 0.72, zone: 'bay', attach: 'BR' },
  vvl: { y: 0.92, x: 1.5, z: -0.1, zone: 'bay', attach: 'BC' },
  genecu: { y: 0.7, zone: 'bay', attach: 'BFR' },
  gen: { y: 0.55, x: 1.88, z: 0.3, zone: 'bay', attach: 'BFR' },
  meter: { y: 1.0, zone: 'dash', attach: 'DLC' },
  body: { y: 0.52, z: -0.7, zone: 'dash', attach: 'DL' },
  steer: { y: 0.9, x: 0.44, z: -0.37, zone: 'dash', attach: 'DLC' },
  eps: { y: 0.72, z: -0.37, zone: 'dash', attach: 'DLC' },
  ac: { y: 0.6, zone: 'dash', attach: 'DRC' },
  radio: { y: 0.87, z: 0.02, zone: 'dash', attach: 'DC' },
  nav: { y: 0.87, z: 0.02, zone: 'dash', attach: 'DC' },
  cert: { y: 0.6, zone: 'dash', attach: 'DR' },
  jc3: { y: 0.7, zone: 'dash', attach: 'DC' },
  jc2: { y: 0.86, zone: 'dash', attach: 'DR' },
  dlc3: { y: 0.45, z: -0.55, zone: 'dash', attach: 'DL' },
  jc1: { y: 0.6, z: -0.62, zone: 'dash', attach: 'DL' },
  acpanel: { y: 0.7, x: 0.6, z: 0.02, zone: 'dash', attach: 'DC' },
  idbox: { y: 0.6, zone: 'dash', attach: 'DLC' },
  slock: { y: 0.77, x: 0.58, z: -0.37, zone: 'dash', attach: 'DLC' },
  immo: { y: 0.8, x: 0.53, z: -0.24, zone: 'dash', attach: 'DLC' },
  airbag: { y: 0.3, zone: 'floor', attach: 'FC2' },
  ods: { y: 0.25, z: 0.37, zone: 'floor', attach: 'FC2' },
  pwm: { y: 0.66, x: 0.4, z: -0.8, zone: 'door', attach: 'DM' },
  roof: { y: 1.37, x: 0.15, zone: 'roof', attach: 'RFC' },
  rcv: { y: 0.98, x: -1.33, z: 0.36, zone: 'rear', attach: 'RSC' },
  tpms: { y: 0.96, x: -1.42, z: 0.6, zone: 'rear', attach: 'RSR' },
  camera: { y: 0.9, x: -2.3, z: 0, zone: 'trunk', attach: 'TL' },
  fob: { y: 1.05, x: 0.3, z: -1.32, zone: 'outside' },
  valves: {
    y: DIM.tireR + 0.17,
    x: AXLE_R,
    z: DIM.trackR / 2 + 0.1,
    zone: 'outside',
  },
};

export type Shape3 = 'ecu' | 'junction' | 'port' | 'device' | 'sensor';

export interface Place3 {
  pos: Vector3;
  size: V3;
  shape: Shape3;
  zone: Zone;
}

const SIZE: Record<Shape3, V3> = {
  ecu: [0.2, 0.075, 0.15],
  junction: [0.11, 0.05, 0.08],
  port: [0.09, 0.05, 0.07],
  device: [0.13, 0.065, 0.1],
  sensor: [0.085, 0.085, 0.085],
};

export function shapeOf(n: NetNode): Shape3 {
  if (n.kind === 'junction') return 'junction';
  if (n.kind === 'port') return 'port';
  if (n.kind === 'sensor') return 'sensor';
  if (n.kind === 'device') return 'device';
  return 'ecu';
}

const placeCache = new Map<string, Place3>();

export function place(id: string): Place3 {
  const hit = placeCache.get(id);
  if (hit) return hit;
  const n = NODE_BY_ID[id];
  const spec = SPEC[id] ?? { y: 0.8, zone: 'dash' as Zone };
  const [mx, mz] = fromDrawing(n.pos.p[0], n.pos.p[1]);
  const shape = shapeOf(n);
  const p: Place3 = {
    pos: new Vector3(spec.x ?? mx, spec.y, spec.z ?? mz),
    size: SIZE[shape],
    shape,
    zone: spec.zone,
  };
  placeCache.set(id, p);
  return p;
}

/** The other three tire-pressure sensors (the node itself sits at the rear passenger wheel). */
export function valvePositions(): Vector3[] {
  return WHEELS.map((w) => new Vector3(w.x, DIM.tireR + 0.17, w.z + Math.sign(w.z) * 0.1));
}

// ───────────────────────── harness graph ─────────────────────────
// Waypoints of an illustrative harness: a cross-car dash trunk, firewall pass-throughs, the cowl and
// fender aprons in the engine bay, kick panels, both sills, the rear shelf, trunk hinge, A-pillar and door.
const W: Record<string, V3> = {
  DL: [0.86, 0.68, -0.62],
  DLC: [0.88, 0.7, -0.3],
  DC: [0.88, 0.7, 0],
  DRC: [0.88, 0.7, 0.3],
  DR: [0.86, 0.68, 0.62],
  FWL: [1.07, 0.8, -0.48],
  FWR: [1.07, 0.8, 0.48],
  BL: [1.2, 0.84, -0.52],
  BC: [1.22, 0.88, 0],
  BR: [1.2, 0.84, 0.52],
  BFL: [1.82, 0.74, -0.62],
  BFR: [1.82, 0.74, 0.62],
  KL: [0.82, 0.28, -0.7],
  KR: [0.82, 0.28, 0.7],
  SL1: [0.2, 0.2, -0.72],
  SL2: [-0.6, 0.2, -0.72],
  SL3: [-1.25, 0.22, -0.7],
  SR1: [0.2, 0.2, 0.72],
  SR2: [-0.6, 0.2, 0.72],
  SR3: [-1.25, 0.22, 0.7],
  RL: [-1.5, 0.62, -0.62],
  RR: [-1.5, 0.62, 0.62],
  RSL: [-1.52, 0.98, -0.5],
  RSC: [-1.56, 0.99, 0],
  RSR: [-1.52, 0.98, 0.5],
  TH: [-1.72, 1.01, -0.38],
  TL: [-2.14, 0.97, -0.12],
  FC1: [0.6, 0.3, 0],
  FC2: [0.22, 0.24, 0],
  AL: [0.66, 1.12, -0.68],
  RFL: [0.32, 1.37, -0.6],
  RFC: [0.22, 1.39, -0.18],
  DH: [0.92, 0.72, -0.76],
  DM: [0.52, 0.7, -0.8],
};

const LINKS: [string, string][] = [
  ['DL', 'DLC'],
  ['DLC', 'DC'],
  ['DC', 'DRC'],
  ['DRC', 'DR'],
  ['DL', 'FWL'],
  ['DR', 'FWR'],
  ['FWL', 'BL'],
  ['FWR', 'BR'],
  ['BL', 'BC'],
  ['BC', 'BR'],
  ['BL', 'BFL'],
  ['BR', 'BFR'],
  ['DL', 'KL'],
  ['DR', 'KR'],
  ['KL', 'SL1'],
  ['SL1', 'SL2'],
  ['SL2', 'SL3'],
  ['SL3', 'RL'],
  ['KR', 'SR1'],
  ['SR1', 'SR2'],
  ['SR2', 'SR3'],
  ['SR3', 'RR'],
  ['RL', 'RSL'],
  ['RR', 'RSR'],
  ['RSL', 'RSC'],
  ['RSC', 'RSR'],
  ['RSL', 'TH'],
  ['TH', 'TL'],
  ['DC', 'FC1'],
  ['FC1', 'FC2'],
  ['DL', 'AL'],
  ['AL', 'RFL'],
  ['RFL', 'RFC'],
  ['DL', 'DH'],
  ['DH', 'DM'],
];

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function shortest(from: string, to: string): string[] {
  if (from === to) return [from];
  const adj = new Map<string, string[]>();
  for (const [a, b] of LINKS) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const k of open) if (d.get(k)! < best) ((best = d.get(k)!), (cur = k));
    open.delete(cur);
    if (cur === to) break;
    for (const nb of adj.get(cur) ?? []) {
      const nd = best + dist(W[cur], W[nb]);
      if (nd < (d.get(nb) ?? Infinity)) {
        d.set(nb, nd);
        prev.set(nb, cur);
        open.add(nb);
      }
    }
  }
  const path = [to];
  while (path[0] !== from && prev.has(path[0])) path.unshift(prev.get(path[0])!);
  return path;
}

export interface Route3 {
  pts: Vector3[];
  extra?: Vector3[][];
}

const routeCache = new Map<string, Route3>();

/** Dense 3D centreline for an edge: along the harness for wires, an arc through the air for radio. */
export function route(e: Edge): Route3 {
  const hit = routeCache.get(e.id);
  if (hit) return hit;
  const A = place(e.from);
  const B = place(e.to);
  const a: V3 = [A.pos.x, A.pos.y, A.pos.z];
  const b: V3 = [B.pos.x, B.pos.y, B.pos.z];
  let r: Route3;
  if (e.medium === 'rf') {
    if (e.from === 'valves') {
      const arcs = valvePositions().map((p) => arc([p.x, p.y, p.z], b, [0, 0.42, -Math.sign(p.z) * 0.12], 72));
      const primary = arcs[3];
      r = { pts: primary, extra: arcs.slice(0, 3) };
    } else {
      r = { pts: arc(a, b, [0, 0.62, 0], 90) };
    }
  } else {
    const sa = SPEC[e.from]?.attach ?? 'DC';
    const sb = SPEC[e.to]?.attach ?? 'DC';
    const chain = shortest(sa, sb).map((k) => W[k]);
    // spread wires that share harness segments into a loose bundle
    const h1 = hash01(e.id);
    const h2 = hash01(e.id + '#');
    const off: V3 = [(h1 - 0.5) * 0.045, (h2 - 0.5) * 0.045, (hash01(e.id + '%') - 0.5) * 0.045];
    const mid = chain.map((p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]] as V3);
    // leave each module straight out of its top or side before joining the harness
    const lead = (p: V3, toward: V3): V3 => {
      const dy = toward[1] > p[1] ? 0.06 : -0.03;
      return [p[0] + (toward[0] - p[0]) * 0.18, p[1] + dy, p[2] + (toward[2] - p[2]) * 0.18];
    };
    const first = mid[0];
    const last = mid[mid.length - 1];
    const pts: V3[] = [a, lead(a, first), ...mid, lead(b, last), b];
    r = { pts: roundedPolyline(pts, 0.11, 0.008) };
  }
  routeCache.set(e.id, r);
  return r;
}

export const GROUND_TAGS: { text: string; pos: V3 }[] = [
  { text: 'FRONT', pos: [3.05, 0, 0] },
  { text: 'DRIVER SIDE', pos: [0, 0, -HALF_W - 0.75] },
  { text: 'PASSENGER SIDE', pos: [0, 0, HALF_W + 0.75] },
];
