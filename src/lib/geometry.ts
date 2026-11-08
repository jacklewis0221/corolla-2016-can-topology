import type { Pt } from '../data/edges';

export const SAMPLES = 56;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function polyLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Evenly resample a polyline by arc length. */
export function resample(pts: Pt[], n = SAMPLES): Pt[] {
  if (pts.length < 2) return new Array(n).fill(pts[0] ?? [0, 0]);
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  const out: Pt[] = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (si < seg.length - 1 && acc + seg[si] < target) {
      acc += seg[si];
      si++;
    }
    const t = seg[si] === 0 ? 0 : Math.min(1, (target - acc) / seg[si]);
    out.push(lerpPt(pts[si], pts[si + 1], t));
  }
  return out;
}

/** Point at fraction f (0–1) along a polyline. */
export function pointAt(pts: Pt[], f: number): Pt {
  const total = polyLength(pts);
  let target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (target <= d || i === pts.length - 1) return lerpPt(pts[i - 1], pts[i], d === 0 ? 0 : Math.min(1, target / d));
    target -= d;
  }
  return pts[pts.length - 1];
}

/** SVG path for an orthogonal polyline with rounded corners. */
export function roundedPath(pts: Pt[], r = 12): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = x1 - ((x1 - x0) / (l1 || 1)) * rr;
    const ay = y1 - ((y1 - y0) / (l1 || 1)) * rr;
    const bx = x1 + ((x2 - x1) / (l2 || 1)) * rr;
    const by = y1 + ((y2 - y1) / (l2 || 1)) * rr;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${x1},${y1} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

export function polyPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

/** A gently bowed harness curve between two in-car positions. */
export function harnessCurve(a: Pt, b: Pt, bend = 0.14): { pts: Pt[]; d: string } {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: Pt = [mx - dy * bend, my + dx * bend];
  const pts: Pt[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return { pts, d: `M${a[0]},${a[1]} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0]},${b[1]}` };
}

/** Wrap a label into lines that fit a width, using an average glyph width. */
export function wrapLabel(text: string, maxWidth: number, fontSize: number, ratio = 0.54): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * ratio)));
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length === 2 && words.length > 2) {
    // balance two-line labels so neither line is much longer than the other
    let best: string[] = lines;
    let bestMax = Math.max(lines[0].length, lines[1].length);
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const m = Math.max(a.length, b.length);
      if (a.length <= maxChars && b.length <= maxChars && m < bestMax) {
        best = [a, b];
        bestMax = m;
      }
    }
    return best;
  }
  return lines;
}

/** Spread labels along one axis so they keep a minimum gap, preserving order. */
export function spread(ideal: number[], gap: number, min: number, max: number): number[] {
  const xs = ideal.map((x) => Math.max(min, Math.min(max, x)));
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + gap);
  if (xs.length && xs[xs.length - 1] > max) {
    xs[xs.length - 1] = max;
    for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - gap);
  }
  return xs;
}

/** Estimated rendered width of a bold UI label (Satoshi-like metrics). */
export function labelWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.27;
    else if (/[A-Z0-9]/.test(ch)) em += /[MW]/.test(ch) ? 0.86 : /[I1]/.test(ch) ? 0.36 : 0.66;
    else if (/[a-z]/.test(ch)) em += /[mw]/.test(ch) ? 0.8 : /[ijlt]/.test(ch) ? 0.3 : /[fr]/.test(ch) ? 0.38 : 0.55;
    else em += 0.55;
  }
  return em * fontSize;
}

/** Like spread(), but each item has its own width; keeps items inside [min, max]. */
export function spreadWidths(ideal: number[], widths: number[], pad: number, min: number, max: number): number[] {
  const n = ideal.length;
  const xs = ideal.map((x, i) => Math.max(min + widths[i] / 2, Math.min(max - widths[i] / 2, x)));
  for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i], xs[i - 1] + (widths[i - 1] + widths[i]) / 2 + pad);
  if (n && xs[n - 1] > max - widths[n - 1] / 2) {
    xs[n - 1] = max - widths[n - 1] / 2;
    for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - (widths[i] + widths[i + 1]) / 2 - pad);
  }
  return xs;
}
