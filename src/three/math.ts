import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export type V3 = [number, number, number];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Monotone cubic (Fritsch–Carlson) interpolation through [x, y] pairs; no overshoot between control points. */
export function monotone(points: [number, number][]): (x: number) => number {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid;
      else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}

const v = (p: V3) => new Vector3(p[0], p[1], p[2]);

/** Polyline with rounded corners (quadratic fillets), resampled at a fixed spacing. */
export function roundedPolyline(points: V3[], radius: number, spacing = 0.01): Vector3[] {
  const P = points.map(v);
  if (P.length < 2) return P;
  const raw: Vector3[] = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const la = a.distanceTo(b);
    const lc = c.distanceTo(b);
    const r = Math.min(radius, la / 2.1, lc / 2.1);
    const e = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(r));
    const x = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(r));
    raw.push(e);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const q = e
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .add(b.clone().multiplyScalar(2 * (1 - t) * t))
        .add(x.clone().multiplyScalar(t * t));
      raw.push(q);
    }
    raw.push(x);
  }
  raw.push(P[P.length - 1].clone());
  return resample(raw, spacing);
}

/** Even arc-length resampling of a polyline. */
export function resample(pts: Vector3[], spacing: number): Vector3[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(total / spacing) + 1);
  const out: Vector3[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = clamp((s - cum[j]) / seg, 0, 1);
    out.push(pts[j].clone().lerp(pts[j + 1], t));
  }
  return out;
}

export function cumulative(pts: Vector3[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return cum;
}

/** Point at arc-length fraction f (0…1) along a polyline with precomputed cumulative lengths. */
export function pointAlong(pts: Vector3[], cum: number[], f: number, out: Vector3): Vector3 {
  const total = cum[cum.length - 1];
  const s = clamp(f, 0, 1) * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] > s) hi = mid;
    else lo = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  return out.copy(pts[lo]).lerp(pts[hi], (s - cum[lo]) / seg);
}

/** Rotation-minimising (parallel transport) frames along a polyline. */
export function frames(pts: Vector3[]) {
  const n = pts.length;
  const T: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const t = b.clone().sub(a);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    T.push(t.normalize());
  }
  const N: Vector3[] = [];
  const B: Vector3[] = [];
  const ref = Math.abs(T[0].y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let nrm = ref
    .clone()
    .sub(T[0].clone().multiplyScalar(ref.dot(T[0])))
    .normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      nrm = nrm.clone().sub(T[i].clone().multiplyScalar(nrm.dot(T[i])));
      if (nrm.lengthSq() < 1e-10) nrm = N[i - 1].clone();
      nrm.normalize();
    }
    N.push(nrm);
    B.push(T[i].clone().cross(nrm).normalize());
  }
  return { T, N, B };
}

/** Tube mesh around a polyline (no end caps). */
export function tube(pts: Vector3[], radius: number, radial = 7): BufferGeometry {
  const { N, B } = frames(pts);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * N[i].x + Math.sin(a) * B[i].x;
      const ny = Math.cos(a) * N[i].y + Math.sin(a) * B[i].y;
      const nz = Math.cos(a) * N[i].z + Math.sin(a) * B[i].z;
      pos.push(pts[i].x + nx * radius, pts[i].y + ny * radius, pts[i].z + nz * radius);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Two conductors wound around a centreline: a twisted pair. */
export function twistedPair(pts: Vector3[], twistR: number, pitch: number): [Vector3[], Vector3[]] {
  const { N, B } = frames(pts);
  const cum = cumulative(pts);
  const a: Vector3[] = [];
  const b: Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const th = (cum[i] / pitch) * Math.PI * 2;
    const off = N[i]
      .clone()
      .multiplyScalar(Math.cos(th) * twistR)
      .add(B[i].clone().multiplyScalar(Math.sin(th) * twistR));
    a.push(pts[i].clone().add(off));
    b.push(pts[i].clone().sub(off));
  }
  return [a, b];
}

/** Merge several geometries that share the same attributes (position, normal, optional index). */
export function merge(geos: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const nm = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (nm) nor.push(nm.getX(i), nm.getY(i), nm.getZ(i));
      else nor.push(0, 1, 0);
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** Dashed tube: short tube pieces along a polyline (for radio links). */
export function dashedTube(pts: Vector3[], radius: number, dash: number, gap: number): BufferGeometry {
  const cum = cumulative(pts);
  const period = dash + gap;
  const pieces: BufferGeometry[] = [];
  let cur: Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const on = cum[i] % period < dash;
    if (on) cur.push(pts[i]);
    else if (cur.length) {
      if (cur.length > 1) pieces.push(tube(cur, radius, 5));
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(tube(cur, radius, 5));
  return merge(pieces);
}

/** Quadratic Bézier sampled as a polyline. */
export function arc(a: V3, b: V3, lift: V3, n = 64): Vector3[] {
  const A = v(a);
  const Bv = v(b);
  const C = A.clone().add(Bv).multiplyScalar(0.5).add(v(lift));
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(
      A.clone()
        .multiplyScalar((1 - t) * (1 - t))
        .add(C.clone().multiplyScalar(2 * (1 - t) * t))
        .add(Bv.clone().multiplyScalar(t * t)),
    );
  }
  return out;
}

/** Small deterministic hash → [0, 1). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
