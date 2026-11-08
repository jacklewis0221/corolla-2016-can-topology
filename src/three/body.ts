import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { AXLE_F, AXLE_R, DIM, X_FRONT, X_REAR } from './dims';
import { clamp, monotone } from './math';

/*
 * Procedural E170 Corolla sedan body, lofted from cross-sections along the car's length.
 * Profiles are shaped to the published 2016 LE dimensions (length, width, height, wheelbase,
 * ground clearance, tire size); the surface detail between those points is a stylised approximation.
 */

// Centre-line top surface: bumper → hood → windshield → roof → backlite → trunk
const TOP = monotone([
  [X_REAR, 0.9],
  [-2.305, 0.975],
  [-2.28, 1.02],
  [-2.23, 1.045],
  [-2.12, 1.058],
  [-1.9, 1.064],
  [-1.62, 1.07],
  [-1.5, 1.115],
  [-1.3, 1.215],
  [-1.05, 1.335],
  [-0.8, 1.41],
  [-0.5, 1.447],
  [-0.2, DIM.height],
  [0.05, 1.45],
  [0.25, 1.425],
  [0.45, 1.355],
  [0.7, 1.225],
  [0.9, 1.11],
  [1.06, 1.008],
  [1.12, 0.985],
  [1.4, 0.95],
  [1.75, 0.89],
  [2.05, 0.825],
  [2.18, 0.785],
  [2.25, 0.75],
  [2.29, 0.7],
  [2.31, 0.645],
  [X_FRONT, 0.59],
]);
// Underbody height (ground clearance between the bumpers)
const BOT = monotone([
  [X_REAR, 0.4],
  [-2.3, 0.31],
  [-2.25, 0.25],
  [-2.12, 0.21],
  [-1.9, 0.175],
  [-1.6, 0.152],
  [-1.0, DIM.clearance + 0.005],
  [1.0, DIM.clearance + 0.005],
  [1.7, 0.152],
  [1.95, 0.17],
  [2.12, 0.19],
  [2.24, 0.215],
  [2.3, 0.245],
  [X_FRONT, 0.29],
]);
// Half width at the shoulder (widest line)
const HW = monotone([
  [X_REAR, 0.66],
  [-2.3, 0.76],
  [-2.25, 0.82],
  [-2.15, 0.855],
  [-2.0, 0.874],
  [-1.8, 0.884],
  [-1.5, DIM.width / 2],
  [1.4, DIM.width / 2],
  [1.75, 0.884],
  [1.95, 0.872],
  [2.1, 0.85],
  [2.2, 0.815],
  [2.26, 0.77],
  [2.3, 0.7],
  [X_FRONT, 0.6],
]);
const SHOULDER = monotone([
  [X_REAR, 0.7],
  [-2.2, 0.84],
  [-1.6, 0.85],
  [-0.5, 0.82],
  [0.8, 0.79],
  [1.5, 0.77],
  [2.1, 0.7],
  [X_FRONT, 0.5],
]);
// Beltline: window sill in the cabin, hood / trunk edge elsewhere
const BELT = monotone([
  [X_REAR, 0.86],
  [-2.3, 0.95],
  [-2.25, 1.01],
  [-2.15, 1.04],
  [-1.62, 1.05],
  [-1.2, 1.052],
  [-0.6, 1.035],
  [0.2, 1.01],
  [0.8, 0.99],
  [1.06, 0.982],
  [1.12, 0.965],
  [1.4, 0.93],
  [1.75, 0.87],
  [2.05, 0.805],
  [2.18, 0.765],
  [2.25, 0.73],
  [2.29, 0.68],
  [X_FRONT, 0.57],
]);
const CROWN = monotone([
  [X_REAR, 0.008],
  [-2.0, 0.018],
  [-1.62, 0.02],
  [-1.4, 0.045],
  [-0.8, 0.055],
  [0.2, 0.055],
  [0.9, 0.06],
  [1.06, 0.03],
  [1.2, 0.02],
  [2.0, 0.025],
  [X_FRONT, 0.01],
]);
// Half width where the side meets the top surface (roof rail / hood edge)
const WTOP = monotone([
  [X_REAR, 0.5],
  [-2.28, 0.66],
  [-2.2, 0.75],
  [-1.95, 0.8],
  [-1.65, 0.8],
  [-1.45, 0.75],
  [-1.15, 0.69],
  [-0.8, 0.655],
  [-0.3, 0.645],
  [0.2, 0.65],
  [0.55, 0.69],
  [0.85, 0.75],
  [1.06, 0.79],
  [1.25, 0.81],
  [1.8, 0.8],
  [2.1, 0.76],
  [2.25, 0.68],
  [2.3, 0.6],
  [X_FRONT, 0.47],
]);

export const ARCH_R = 0.375;
const WHEEL_Y = DIM.tireR;

function archAt(x: number): number | null {
  for (const ax of [AXLE_F, AXLE_R]) {
    const dx = Math.abs(x - ax);
    if (dx < ARCH_R) return WHEEL_Y + Math.sqrt(ARCH_R * ARCH_R - dx * dx);
  }
  return null;
}

/** Side-glass, windshield and backlite extents along the car. */
export const GLASS = {
  side: [
    [-1.08, -0.085],
    [-0.015, 1.07],
  ] as [number, number][],
  windshield: [0.27, 1.07] as [number, number],
  backlite: [-1.6, -0.78] as [number, number],
};
const inRange = (x: number, r: [number, number]) => x >= r[0] && x <= r[1];

/** Points per half cross-section: 0 underbody centre … 12 roof centre. */
export const K = 13;
const R = 2 * K - 2;

export function halfProfile(x: number): [number, number][] {
  const hw = HW(x);
  const zB = BOT(x);
  const top = TOP(x);
  const belt = Math.min(BELT(x), top - 0.004);
  const crown = Math.min(CROWN(x), Math.max(0.004, (top - belt) * 0.9));
  const wTop = Math.min(WTOP(x), hw * 0.965);
  let zS = SHOULDER(x);
  const arch = archAt(x);
  const p: [number, number][] = [[0, zB]];
  if (arch !== null) {
    const zA = Math.max(arch, zB + 0.14);
    zS = Math.max(zS, zA + 0.06);
    p.push([hw - 0.3, zB], [hw - 0.27, zA - 0.035], [hw - 0.035, zA], [hw * 0.993, zA + 0.012]);
  } else {
    p.push([hw * 0.8, zB], [hw * 0.905, zB + 0.012], [hw * 0.955, zB + 0.045], [hw * 0.985, zB + 0.105]);
  }
  zS = clamp(zS, p[4][1] + 0.015, belt - 0.02);
  p.push([hw, zS]);
  const wBelt = hw * 0.972;
  p.push([wBelt, belt]);
  const g = Math.max(0, top - crown - belt);
  const bulge = g > 0.05 ? 0.012 : 0;
  const side = (s: number): [number, number] => [wBelt + (wTop - wBelt) * s + bulge * Math.sin(Math.PI * s), belt + g * s];
  p.push(side(0.1), side(0.86));
  p.push([wTop, top - crown], [wTop * 0.86, top - crown * 0.42], [wTop * 0.45, top - crown * 0.1], [0, top]);
  return p;
}

/** Ring index j → half-profile index k and side (+1 passenger / −1 driver). */
export function ringK(j: number): { k: number; side: 1 | -1 } {
  return j <= K - 1 ? { k: j, side: 1 } : { k: R - j, side: -1 };
}

function stationList(): number[] {
  const xs: number[] = [];
  for (let x = X_REAR; x <= X_FRONT + 1e-9; x += 0.03) xs.push(Math.min(x, X_FRONT));
  for (let x = X_REAR; x < X_REAR + 0.07; x += 0.007) xs.push(x);
  for (let x = X_FRONT - 0.07; x < X_FRONT; x += 0.007) xs.push(x);
  for (const ax of [AXLE_F, AXLE_R]) for (const d of [-1, 1]) for (const e of [-0.0015, 0.0015]) xs.push(ax + d * (ARCH_R + e));
  for (const r of [...GLASS.side, GLASS.windshield, GLASS.backlite]) xs.push(r[0], r[1]);
  xs.push(X_FRONT);
  xs.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of xs) if (!out.length || x - out[out.length - 1] > 0.0009) out.push(x);
  if (out[out.length - 1] < X_FRONT) out.push(X_FRONT);
  return out;
}

export interface BodyGeometry {
  shell: BufferGeometry; // groups: 0 = painted body, 1 = glass
  caps: BufferGeometry;
  lines: BufferGeometry; // line segments with outward normals
  accentLines: BufferGeometry; // glass outlines and door cuts
}

export function buildBody(): BodyGeometry {
  const xs = stationList();
  const S = xs.length;
  const pos = new Float32Array(S * R * 3);
  const rings: [number, number][][] = [];
  xs.forEach((x, i) => {
    const hp = halfProfile(x);
    rings.push(hp);
    for (let j = 0; j < R; j++) {
      const { k, side } = ringK(j);
      const o = (i * R + j) * 3;
      pos[o] = x;
      pos[o + 1] = hp[k][1];
      pos[o + 2] = side * hp[k][0];
    }
  });

  const body: number[] = [];
  const glass: number[] = [];
  for (let i = 0; i < S - 1; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2;
    const sideGlass = GLASS.side.some((r) => inRange(xm, r));
    const topGlass = inRange(xm, GLASS.windshield) || inRange(xm, GLASS.backlite);
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + j;
      const d = (i + 1) * R + ((j + 1) % R);
      const isGlass = (sideGlass && (j === 7 || j === 16)) || (topGlass && j >= 10 && j <= 13);
      (isGlass ? glass : body).push(a, c, b, b, c, d);
    }
  }
  const shell = new BufferGeometry();
  shell.setAttribute('position', new Float32BufferAttribute(pos, 3));
  shell.setIndex([...body, ...glass]);
  shell.addGroup(0, body.length, 0);
  shell.addGroup(body.length, glass.length, 1);
  shell.computeVertexNormals();
  const nrm = shell.getAttribute('normal');

  // end caps with flat normals
  const capPos: number[] = [];
  const capNor: number[] = [];
  const cap = (i: number, dir: 1 | -1) => {
    const x = xs[i];
    let cy = 0;
    for (let j = 0; j < R; j++) cy += pos[(i * R + j) * 3 + 1];
    cy /= R;
    for (let j = 0; j < R; j++) {
      const a = (i * R + j) * 3;
      const b = (i * R + ((j + 1) % R)) * 3;
      const tri =
        dir === -1
          ? [
              [x, cy, 0],
              [pos[a], pos[a + 1], pos[a + 2]],
              [pos[b], pos[b + 1], pos[b + 2]],
            ]
          : [
              [x, cy, 0],
              [pos[b], pos[b + 1], pos[b + 2]],
              [pos[a], pos[a + 1], pos[a + 2]],
            ];
      for (const t of tri) {
        capPos.push(t[0], t[1], t[2]);
        capNor.push(dir, 0, 0);
      }
    }
  };
  cap(0, -1);
  cap(S - 1, 1);
  const caps = new BufferGeometry();
  caps.setAttribute('position', new Float32BufferAttribute(capPos, 3));
  caps.setAttribute('normal', new Float32BufferAttribute(capNor, 3));

  // ── frame lines ──
  const lp: number[] = [];
  const ln: number[] = [];
  const ap: number[] = [];
  const an: number[] = [];
  const vert = (i: number, j: number, P: number[], N: number[]) => {
    const o = (i * R + j) * 3;
    P.push(pos[o], pos[o + 1], pos[o + 2]);
    N.push(nrm.getX(i * R + j), nrm.getY(i * R + j), nrm.getZ(i * R + j));
  };
  const seg = (i1: number, j1: number, i2: number, j2: number, accent = false) => {
    vert(i1, j1, accent ? ap : lp, accent ? an : ln);
    vert(i2, j2, accent ? ap : lp, accent ? an : ln);
  };
  const nearest = (x: number) => {
    let best = 0;
    for (let i = 1; i < S; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    return best;
  };
  const jOf = (k: number, side: 1 | -1) => (side === 1 ? k : R - k);

  // cross-section rings, skipping the wheel openings
  for (let x = X_REAR + 0.06; x < X_FRONT - 0.03; x += 0.205) {
    if (Math.abs(x - AXLE_F) < ARCH_R + 0.04 || Math.abs(x - AXLE_R) < ARCH_R + 0.04) continue;
    const i = nearest(x);
    for (let j = 0; j < R; j++) seg(i, j, i, (j + 1) % R);
  }
  // the outline of the bumper faces
  for (const i of [0, S - 1]) for (let j = 0; j < R; j++) seg(i, j, i, (j + 1) % R);
  // longitudinal feature lines
  for (let i = 0; i < S - 1; i++) {
    for (const k of [1, 4, 5, 6, 9]) for (const s of [1, -1] as const) seg(i, jOf(k, s), i + 1, jOf(k, s));
    seg(i, 12, i + 1, 12);
    // glass outlines
    const xm = (xs[i] + xs[i + 1]) / 2;
    if (GLASS.side.some((r) => inRange(xm, r)))
      for (const k of [7, 8]) for (const s of [1, -1] as const) seg(i, jOf(k, s), i + 1, jOf(k, s), true);
    if (inRange(xm, GLASS.windshield) || inRange(xm, GLASS.backlite))
      for (const s of [1, -1] as const) seg(i, jOf(10, s), i + 1, jOf(10, s), true);
  }
  for (const r of GLASS.side)
    for (const x of r) {
      const i = nearest(x);
      for (const s of [1, -1] as const) seg(i, jOf(7, s), i, jOf(8, s), true);
    }
  for (const r of [GLASS.windshield, GLASS.backlite])
    for (const x of r) {
      const i = nearest(x);
      for (let j = 10; j < 14; j++) seg(i, j, i, j + 1, true);
    }
  // door cuts and the B-pillar
  for (const x of [1.02, -0.05, -0.965]) {
    const i = nearest(x);
    for (const s of [1, -1] as const) for (let k = 4; k < 6; k++) seg(i, jOf(k, s), i, jOf(k + 1, s), true);
  }
  {
    const i = nearest(-0.05);
    for (const s of [1, -1] as const) for (let k = 6; k < 9; k++) seg(i, jOf(k, s), i, jOf(k + 1, s), true);
  }

  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(lp, 3));
  lines.setAttribute('normal', new Float32BufferAttribute(ln, 3));
  const accentLines = new BufferGeometry();
  accentLines.setAttribute('position', new Float32BufferAttribute(ap, 3));
  accentLines.setAttribute('normal', new Float32BufferAttribute(an, 3));
  return { shell, caps, lines, accentLines };
}

/** Point on the body side at station x and height h (side +1 passenger / −1 driver), nudged outward. */
export function surfaceAt(x: number, h: number, side: 1 | -1, lift = 0.004): Vector3 {
  const hp = halfProfile(x);
  h = clamp(h, hp[4][1], hp[9][1]);
  let w = hp[K - 1][0];
  for (let k = 3; k < K - 1; k++) {
    const [w0, h0] = hp[k];
    const [w1, h1] = hp[k + 1];
    if ((h >= h0 && h <= h1) || (h <= h0 && h >= h1)) {
      const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
      w = w0 + (w1 - w0) * t;
      break;
    }
    if (k === 3 && h < h0) {
      w = w0;
      break;
    }
  }
  return new Vector3(x, h, side * (w + lift));
}

/** A lamp-shaped band on both sides of the body, hugging the hood / trunk edge. */
function band(x0: number, x1: number, shape: (k: number) => { drop: number; thick: number }, n = 36): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const side of [1, -1] as const) {
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const edge = halfProfile(x)[9][1];
      const { drop, thick } = shape(i / n);
      const a = surfaceAt(x, edge - drop - thick, side, 0.006);
      const b = surfaceAt(x, edge - drop, side, 0.006);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      if (side === 1) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += (n + 1) * 2;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat polygon on a bumper face: points are [z, y]. */
function facePoly(x: number, pts: [number, number][], dir: 1 | -1): BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const tri = dir === 1 ? [pts[0], pts[i], pts[i + 1]] : [pts[0], pts[i + 1], pts[i]];
    for (const [z, y] of tri) pos.push(x, y, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const mirrorZ = (pts: [number, number][]): [number, number][] => pts.map(([z, y]) => [-z, y] as [number, number]).reverse();

export function buildLights() {
  // swept headlamps: a thin tail along the fender, widening into the front corner
  const head = band(1.9, X_FRONT - 0.004, (k) => ({ drop: 0.008, thick: 0.016 + 0.07 * k * k * (3 - 2 * k) }));
  // wraparound tail lamps: widest at the rear corner
  const tail = band(X_REAR + 0.004, -2.06, (k) => ({ drop: 0.016, thick: 0.026 + 0.05 * (1 - k) * (1 - k) * (1 + 2 * k) }));
  const xf = X_FRONT + 0.004;
  const xr = X_REAR - 0.004;
  const grille = facePoly(
    xf,
    [
      [-0.4, 0.315],
      [0.4, 0.315],
      [0.33, 0.5],
      [-0.33, 0.5],
    ],
    1,
  );
  const slot = facePoly(
    xf,
    [
      [-0.3, 0.532],
      [0.3, 0.532],
      [0.28, 0.566],
      [-0.28, 0.566],
    ],
    1,
  );
  // front-face part of each headlamp, running in from the corner toward the upper grille bar
  const headInner: [number, number][] = [
    [0.31, 0.548],
    [0.6, 0.514],
    [0.604, 0.584],
    [0.52, 0.598],
    [0.31, 0.582],
  ];
  const headFace = [facePoly(xf, headInner, 1), facePoly(xf, mirrorZ(headInner), 1)];
  // rear-face part of each tail lamp, continuing the side lamp across the trunk lid
  const tailInner: [number, number][] = [
    [0.34, 0.838],
    [0.5, 0.826],
    [0.655, 0.818],
    [0.658, 0.87],
    [0.6, 0.884],
    [0.34, 0.87],
  ];
  const tailFace = [facePoly(xr, tailInner, -1), facePoly(xr, mirrorZ(tailInner), -1)];
  const plate = facePoly(
    xr,
    [
      [-0.165, 0.56],
      [0.165, 0.56],
      [0.165, 0.715],
      [-0.165, 0.715],
    ],
    -1,
  );
  return { head, tail, grille, slot, headFace, tailFace, plate };
}

/** Tire (lathe), wheel cover and hub for one wheel, axle along Z. */
export function buildWheelParts() {
  const r0 = DIM.rimR + 0.004;
  const r1 = DIM.tireR;
  const hw = DIM.tireW / 2;
  const prof = [
    [r0, -hw * 0.86],
    [r0 + 0.04, -hw],
    [r1 - 0.03, -hw * 0.96],
    [r1, -hw * 0.66],
    [r1 + 0.002, 0],
    [r1, hw * 0.66],
    [r1 - 0.03, hw * 0.96],
    [r0 + 0.04, hw],
    [r0, hw * 0.86],
  ].map(([x, y]) => new Vector2(x, y));
  const tire = new LatheGeometry(prof, 56);
  tire.rotateX(Math.PI / 2);
  const cover = new CylinderGeometry(DIM.rimR, DIM.rimR, 0.012, 48);
  cover.rotateX(Math.PI / 2);
  const hub = new CylinderGeometry(0.055, 0.055, 0.02, 24);
  hub.rotateX(Math.PI / 2);
  return { tire, cover, hub };
}

/** Ghosted interior and engine-bay landmarks so module positions read in context. */
export function buildCabin(): { geo: BufferGeometry; name: string }[] {
  const out: { geo: BufferGeometry; name: string }[] = [];
  const box = (name: string, c: [number, number, number], s: [number, number, number], rot?: [number, number, number]) => {
    const g = new BoxGeometry(s[0], s[1], s[2]);
    if (rot) {
      g.rotateX(rot[0]);
      g.rotateY(rot[1]);
      g.rotateZ(rot[2]);
    }
    g.translate(c[0], c[1], c[2]);
    out.push({ geo: g, name });
  };
  // instrument panel: side profile extruded across the car
  const ip = new Shape();
  const prof: [number, number][] = [
    [1.06, 0.97],
    [0.84, 1.03],
    [0.7, 0.99],
    [0.66, 0.9],
    [0.64, 0.62],
    [0.7, 0.44],
    [1.02, 0.4],
  ];
  ip.moveTo(prof[0][0], prof[0][1]);
  for (const [x, y] of prof.slice(1)) ip.lineTo(x, y);
  ip.closePath();
  const dash = new ExtrudeGeometry(ip, { depth: 1.5, bevelEnabled: false });
  dash.translate(0, 0, -0.75);
  out.push({ geo: dash, name: 'dash' });
  box('stack', [0.62, 0.66, 0], [0.12, 0.46, 0.3]);
  box('console', [0.2, 0.37, 0], [0.9, 0.2, 0.24]);
  for (const z of [-0.37, 0.37]) {
    box('cushion', [-0.05, 0.42, z], [0.52, 0.12, 0.5], [0, 0, -0.08]);
    box('backrest', [-0.36, 0.76, z], [0.12, 0.64, 0.5], [0, 0, -0.26]);
    box('headrest', [-0.46, 1.16, z], [0.1, 0.18, 0.26], [0, 0, -0.26]);
  }
  box('rear cushion', [-0.98, 0.43, 0], [0.5, 0.13, 1.32], [0, 0, -0.08]);
  box('rear backrest', [-1.27, 0.76, 0], [0.12, 0.6, 1.32], [0, 0, -0.34]);
  // steering wheel and column
  // column axis runs from the wheel hub (0.42, 0.90) forward and down to (0.86, 0.66)
  const axis = Math.atan2(-0.24, 0.44);
  const rim = new TorusGeometry(0.18, 0.016, 10, 40);
  rim.rotateY(Math.PI / 2);
  rim.rotateZ(axis);
  rim.translate(0.42, 0.9, -0.37);
  out.push({ geo: rim, name: 'steering wheel' });
  const col = new CylinderGeometry(0.03, 0.035, 0.5, 12);
  col.rotateZ(axis - Math.PI / 2);
  col.translate(0.64, 0.78, -0.37);
  out.push({ geo: col, name: 'column' });
  // engine bay
  box('firewall', [1.07, 0.6, 0], [0.02, 0.62, 1.46]);
  box('engine', [1.66, 0.6, 0.06], [0.4, 0.46, 0.62]);
  box('cam cover', [1.62, 0.87, 0.06], [0.24, 0.08, 0.56]);
  box('transaxle', [1.58, 0.47, -0.44], [0.38, 0.36, 0.28]);
  box('battery', [1.52, 0.72, -0.6], [0.24, 0.2, 0.17]);
  box('radiator', [2.08, 0.5, 0], [0.05, 0.4, 1.08]);
  return out;
}
