import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Spherical,
  CylinderGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NODES, type NetNode } from '../data/nodes';
import { EDGES, MEDIUM_LAYER, type Edge, type Medium } from '../data/edges';
import type { Layers, Packet, Pulse } from '../lib/model';
import { buildBody, buildCabin, buildLights, buildWheelParts } from './body';
import { DIM, WHEELS } from './dims';
import { GROUND_TAGS, place, route, valvePositions } from './layout';
import { clamp, cumulative, dashedTube, easeInOutCubic, merge, pointAlong, tube, twistedPair } from './math';

export type Hit = { kind: 'node'; id: string } | { kind: 'edge'; id: string };
export type ViewName = 'iso' | 'side' | 'top' | 'front' | 'rear';
export type ShellMode = 'glass' | 'frame';

export interface SceneCallbacks {
  pick(hit: Hit | null, dbl: boolean): void;
  hover(hit: Hit | null, clientX: number, clientY: number): void;
  userMove(): void;
}

export interface LabelBinding {
  /** label buttons keyed by node id */
  labels: Map<string, HTMLElement>;
  /** leader lines keyed by node id */
  leaders: Map<string, SVGLineElement>;
  /** ground direction tags in GROUND_TAGS order */
  tags: HTMLElement[];
  priority: (id: string) => number;
}

export const VIEWS: Record<ViewName, { pos: [number, number, number]; target: [number, number, number]; label: string; short: string }> = {
  iso: { pos: [5.0, 2.85, -4.7], target: [0.12, 0.62, 0], label: 'Three-quarter front view', short: '3/4' },
  side: { pos: [0.08, 1.15, -7.9], target: [0.08, 0.66, 0], label: 'Driver side view', short: 'Side' },
  top: { pos: [0.08, 9.0, 0.0001], target: [0.08, 0.5, 0], label: 'Top view', short: 'Top' },
  front: { pos: [7.6, 1.3, 0], target: [0, 0.66, 0], label: 'Front view', short: 'Front' },
  rear: { pos: [-7.6, 1.7, 0], target: [0, 0.66, 0], label: 'Rear view', short: 'Rear' },
};

/** Narrowest viewport aspect (width / height) at which each preset still shows the whole car. */
const VIEW_FIT: Record<ViewName, number> = { iso: 1.55, side: 1.62, top: 1.42, front: 0.8, rear: 0.8 };

// ───────────────────────── shaders ─────────────────────────

const rimVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const rimFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uBase;
uniform float uRim;
uniform float uPower;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(uColor, (uBase + uRim * pow(f, uPower)) * uOpacity);
  #include <colorspace_fragment>
}`;

const lineVert = /* glsl */ `
varying float vF;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vF = dot(n, normalize(-mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;
const lineFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uFront;
uniform float uBack;
uniform float uOpacity;
varying float vF;
void main() {
  gl_FragColor = vec4(uColor, mix(uBack, uFront, smoothstep(-0.12, 0.25, vF)) * uOpacity);
  #include <colorspace_fragment>
}`;

const ptsVert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  vColor = aColor;
  vAlpha = aAlpha;
  vKind = aKind;
  gl_Position = projectionMatrix * mv;
}`;
const ptsFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  vec3 col = vColor;
  float a;
  if (vKind < 0.5) {
    float core = smoothstep(0.34, 0.0, d);
    float halo = pow(1.0 - d, 2.4);
    col = mix(vColor, vec3(1.0), core * 0.85);
    a = max(core, halo * 0.8);
  } else if (vKind < 1.5) {
    a = smoothstep(0.14, 0.0, abs(d - 0.8));
  } else {
    a = pow(1.0 - d, 1.7) * 0.75;
  }
  gl_FragColor = vec4(col, a * vAlpha);
  #include <colorspace_fragment>
}`;

// ───────────────────────── palette ─────────────────────────

interface Palette {
  light: boolean;
  medium: Record<Medium | 'canL' | 'localL', Color>;
  domain: Record<string, Color>;
  accent: Color;
  danger: Color;
  ok: Color;
  shell: Color;
  glass: Color;
  line: Color;
  accentLine: Color;
  tire: Color;
  cover: Color;
  grid: Color;
  junction: Color;
  muted: Color;
}

function cssColor(name: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const c = new Color();
  try {
    c.setStyle(/^#|^rgb\(/.test(v) ? v : fallback);
  } catch {
    c.setStyle(fallback);
  }
  return c;
}

function readPalette(): Palette {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    light,
    medium: {
      can: cssColor('--can-h', '#f0a83c'),
      canL: cssColor('--can-l', '#efe9dc'),
      local: cssColor('--local-h', '#ef7d3c'),
      localL: cssColor('--local-l', '#8e979f'),
      lin: cssColor('--lin', '#5ec2e8'),
      serial: cssColor('--serial', '#a993ea'),
      wire: cssColor('--wire', '#7f8a94'),
      rf: cssColor('--rf', '#e98fb6'),
      video: cssColor('--video', '#7fd49b'),
    },
    domain: {
      powertrain: cssColor('--d-powertrain', '#f08a4b'),
      chassis: cssColor('--d-chassis', '#4fc6b6'),
      body: cssColor('--d-body', '#82a9ea'),
      safety: cssColor('--d-safety', '#ec6874'),
      infotainment: cssColor('--d-infotainment', '#bb97ea'),
      diagnostic: cssColor('--d-diagnostic', '#a9b3bc'),
    },
    accent: cssColor('--accent', '#f0a83c'),
    danger: cssColor('--danger', '#f06b6b'),
    ok: cssColor('--ok', '#6fd59a'),
    shell: new Color(light ? '#2c3a47' : '#c9d6e2'),
    glass: new Color(light ? '#1f5f86' : '#8fd0f0'),
    line: new Color(light ? '#33414e' : '#cdd9e4'),
    accentLine: new Color(light ? '#1d2a35' : '#e6eef5'),
    tire: new Color(light ? '#2a2f35' : '#14181c'),
    cover: new Color(light ? '#aeb6bd' : '#7d8790'),
    grid: new Color(light ? '#3c4650' : '#a0afbe'),
    junction: new Color(light ? '#d9d3c7' : '#26313a'),
    muted: new Color(light ? '#9aa3ab' : '#4b5560'),
  };
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 64, 4, 128, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.42)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.setTransform(2, 0, 0, 1, 0, 0);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ───────────────────────── scene objects ─────────────────────────

interface NodeObj {
  node: NetNode;
  group: Group;
  mesh: Mesh;
  mat: MeshStandardMaterial;
  outline: Mesh;
  outlineMat: MeshBasicMaterial;
  pos: Vector3;
  anchor: Vector3;
  extras: Mesh[];
}

interface EdgeObj {
  edge: Edge;
  group: Group;
  mats: MeshStandardMaterial[];
  colors: Color[];
  hit: Mesh;
  pts: Vector3[];
  cum: number[];
  extra: { pts: Vector3[]; cum: number[] }[];
}

const MAX_PTS = 320;

export class CarScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1.6, 0.05, 80);
  private controls: OrbitControls;
  private raycaster = new Raycaster();
  private mouse = new Vector2(-9, -9);
  private pal: Palette;
  private cb: SceneCallbacks;
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private reduced: boolean;

  private nodes = new Map<string, NodeObj>();
  private edges = new Map<string, EdgeObj>();
  private present = new Set<string>();
  private presentEdges = new Set<string>();
  private layers: Layers = {
    can: true,
    lin: true,
    serial: true,
    wire: true,
    rfvideo: true,
  };
  private selected: string | null = null;
  private selectedEdge: string | null = null;
  private hovered: Hit | null = null;
  private focusHover: string | null = null;
  private silent: string | null = null;
  private packets: Packet[] = [];
  private pulses: Pulse[] = [];
  private pulseMs = 900;

  private shellGroup = new Group();
  private shellMesh!: Mesh;
  private capMesh!: Mesh;
  private shellMat!: ShaderMaterial;
  private glassMat!: ShaderMaterial;
  private lineMat!: ShaderMaterial;
  private accentMat!: ShaderMaterial;
  private cabinGroup = new Group();
  private cabinMat!: ShaderMaterial;
  private cabinLineMat!: LineBasicMaterial;
  private wheelMats: {
    tire: MeshStandardMaterial;
    cover: MeshStandardMaterial;
    hub: MeshStandardMaterial;
  } | null = null;
  private lightMats: {
    head: MeshBasicMaterial;
    tail: MeshBasicMaterial;
    grille: MeshBasicMaterial;
    slot: MeshBasicMaterial;
    plate: MeshBasicMaterial;
  } | null = null;
  private gridMat!: LineBasicMaterial;
  private grid!: LineSegments;
  private shadowMat!: MeshBasicMaterial;
  private points!: Points;
  private ptsMat!: ShaderMaterial;
  private hemi!: HemisphereLight;

  private labels: LabelBinding | null = null;
  private labelSize = new Map<string, { w: number; h: number }>();
  private lastLabel = new Map<string, string>();

  private raf = 0;
  private dirty = true;
  private visible = true;
  private hoverDirty = false;
  private down: { x: number; y: number; t: number; button: number } | null = null;
  private dragged = false;
  private tween: {
    t0: number;
    dur: number;
    fromT: Vector3;
    toT: Vector3;
    fromS: Spherical;
    toS: Spherical;
  } | null = null;
  private viewShift = 0;
  private viewShiftTarget = 0;
  private lastFrame = performance.now();
  private size = { w: 1, h: 1 };
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private mo: MutationObserver;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement, cb: SceneCallbacks, opts: { reduced: boolean }) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.cb = cb;
    this.reduced = opts.reduced;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.pal = readPalette();

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.rotateSpeed = 0.75;
    this.controls.panSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 22;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.cb.userMove();
    });
    this.controls.addEventListener('change', () => (this.dirty = true));

    this.build();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.io = new IntersectionObserver((es) => {
      this.visible = es.some((e) => e.isIntersecting);
      if (this.visible) this.dirty = true;
    });
    this.io.observe(wrap);
    this.mo = new MutationObserver(() => this.applyTheme());
    this.mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('dblclick', this.onDbl);
    canvas.addEventListener('contextmenu', this.onContext);
    canvas.addEventListener('webglcontextlost', this.onLost);

    this.resize();
    const start = this.fitPose(this.reduced ? 'iso' : 'top');
    this.camera.position.copy(start.pos);
    this.controls.target.copy(start.target);
    this.controls.update();
    if (!this.reduced) window.setTimeout(() => !this.disposed && this.view('iso', true, 1700), 250);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────── construction ─────────────

  private rimMaterial(color: Color, base: number, rim: number, power: number): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uBase: { value: base },
        uRim: { value: rim },
        uPower: { value: power },
        uOpacity: { value: 1 },
      },
      vertexShader: rimVert,
      fragmentShader: rimFrag,
      transparent: true,
      depthWrite: false,
      side: FrontSide,
    });
  }

  private lineMaterial(color: Color, front: number, back: number): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uFront: { value: front },
        uBack: { value: back },
        uOpacity: { value: 1 },
      },
      vertexShader: lineVert,
      fragmentShader: lineFrag,
      transparent: true,
      depthWrite: false,
    });
  }

  private build() {
    const P = this.pal;
    this.hemi = new HemisphereLight(0xffffff, 0x3b4a58, P.light ? 1.6 : 1.25);
    this.scene.add(this.hemi);
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 7, -3);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.55);
    fill.position.set(-5, 3, 5);
    this.scene.add(fill);

    // ground: fading grid and a soft shadow
    const gp: number[] = [];
    const gc: number[] = [];
    const R = 6.5;
    const push = (x1: number, z1: number, x2: number, z2: number) => {
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const a = i / steps;
        const b = (i + 1) / steps;
        for (const t of [a, b]) {
          const x = x1 + (x2 - x1) * t;
          const z = z1 + (z2 - z1) * t;
          gp.push(x, 0, z);
          const fade = Math.max(0, 1 - Math.hypot(x / 1.15, z) / R);
          gc.push(P.grid.r, P.grid.g, P.grid.b, Math.pow(fade, 1.6));
        }
      }
    };
    for (let v = -R; v <= R + 1e-6; v += 0.5) {
      push(v, -R, v, R);
      push(-R, v, R, v);
    }
    const gg = new BufferGeometry();
    gg.setAttribute('position', new Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new Float32BufferAttribute(gc, 4));
    this.gridMat = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: P.light ? 0.22 : 0.16,
      depthWrite: false,
    });
    const grid = new LineSegments(gg, this.gridMat);
    grid.renderOrder = -2;
    this.grid = grid;
    this.scene.add(grid);
    this.shadowMat = new MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: P.light ? 0.32 : 0.75,
    });
    const shadow = new Mesh(new PlaneGeometry(5.6, 2.5), this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.renderOrder = -1;
    this.scene.add(shadow);

    // body shell, glass, frame lines
    const body = buildBody();
    this.shellMat = this.rimMaterial(P.shell, P.light ? 0.03 : 0.035, P.light ? 0.2 : 0.26, 2.4);
    this.glassMat = this.rimMaterial(P.glass, P.light ? 0.07 : 0.09, P.light ? 0.2 : 0.24, 1.8);
    this.shellMesh = new Mesh(body.shell, [this.shellMat, this.glassMat]);
    this.shellMesh.renderOrder = 4;
    this.capMesh = new Mesh(body.caps, this.shellMat);
    this.capMesh.renderOrder = 4;
    this.lineMat = this.lineMaterial(P.line, P.light ? 0.42 : 0.38, P.light ? 0.1 : 0.085);
    this.accentMat = this.lineMaterial(P.accentLine, P.light ? 0.75 : 0.7, P.light ? 0.16 : 0.14);
    const lines = new LineSegments(body.lines, this.lineMat);
    const accent = new LineSegments(body.accentLines, this.accentMat);
    lines.renderOrder = 5;
    accent.renderOrder = 5;
    this.shellGroup.add(this.shellMesh, this.capMesh, lines, accent);

    // lamps, grille, plate
    const L = buildLights();
    this.lightMats = {
      head: new MeshBasicMaterial({
        color: P.light ? '#8fa7bd' : '#eaf4ff',
        transparent: true,
        opacity: 0.92,
        side: DoubleSide,
      }),
      tail: new MeshBasicMaterial({
        color: '#e5484d',
        transparent: true,
        opacity: 0.82,
        side: DoubleSide,
      }),
      grille: new MeshBasicMaterial({
        color: P.light ? '#20272e' : '#05070a',
        transparent: true,
        opacity: 0.8,
        side: DoubleSide,
      }),
      slot: new MeshBasicMaterial({
        color: P.light ? '#5c6670' : '#3a4550',
        transparent: true,
        opacity: 0.85,
        side: DoubleSide,
      }),
      plate: new MeshBasicMaterial({
        color: P.light ? '#e9edf0' : '#c6ced6',
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
      }),
    };
    const LM = this.lightMats;
    const decals: [BufferGeometry, Material][] = [
      [L.head, LM.head],
      [L.tail, LM.tail],
      [L.grille, LM.grille],
      [L.slot, LM.slot],
      [L.plate, LM.plate],
    ];
    for (const t of L.tailFace) decals.push([t, LM.tail]);
    for (const h of L.headFace) decals.push([h, LM.head]);
    for (const [g, m] of decals) {
      const m3 = new Mesh(g, m);
      m3.renderOrder = 3;
      this.shellGroup.add(m3);
    }

    // mirrors
    for (const s of [-1, 1]) {
      const g = new RoundedBoxGeometry(0.17, 0.1, 0.12, 2, 0.03);
      g.translate(0.95, 1.0, s * 0.955);
      const m = new Mesh(g, this.shellMat);
      m.renderOrder = 4;
      const e = new LineSegments(new EdgesGeometry(g, 30), this.cabinLineMatLazy());
      this.shellGroup.add(m, e);
    }
    this.scene.add(this.shellGroup);

    // wheels
    const W = buildWheelParts();
    this.wheelMats = {
      tire: new MeshStandardMaterial({
        color: P.tire,
        roughness: 0.92,
        metalness: 0,
      }),
      cover: new MeshStandardMaterial({
        color: P.cover,
        roughness: 0.45,
        metalness: 0.55,
      }),
      hub: new MeshStandardMaterial({
        color: P.tire,
        roughness: 0.6,
        metalness: 0.3,
      }),
    };
    for (const w of WHEELS) {
      const g = new Group();
      g.position.set(w.x, DIM.tireR, w.z);
      const out = Math.sign(w.z);
      const tire = new Mesh(W.tire, this.wheelMats.tire);
      const cover = new Mesh(W.cover, this.wheelMats.cover);
      cover.position.z = out * (DIM.tireW / 2 - 0.02);
      const hub = new Mesh(W.hub, this.wheelMats.hub);
      hub.position.z = out * (DIM.tireW / 2 - 0.005);
      // wheel-cover slots
      const sp: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        sp.push(
          Math.cos(a) * 0.08,
          Math.sin(a) * 0.08,
          out * (DIM.tireW / 2 - 0.012),
          Math.cos(a) * 0.19,
          Math.sin(a) * 0.19,
          out * (DIM.tireW / 2 - 0.012),
        );
      }
      const sg = new BufferGeometry();
      sg.setAttribute('position', new Float32BufferAttribute(sp, 3));
      const spokes = new LineSegments(sg, this.cabinLineMatLazy());
      g.add(tire, cover, hub, spokes);
      this.scene.add(g);
    }

    // cabin landmarks
    this.cabinMat = this.rimMaterial(P.shell, P.light ? 0.05 : 0.045, P.light ? 0.16 : 0.18, 1.6);
    for (const { geo } of buildCabin()) {
      const m = new Mesh(geo, this.cabinMat);
      m.renderOrder = 2;
      const e = new LineSegments(new EdgesGeometry(geo, 28), this.cabinLineMatLazy());
      e.renderOrder = 2;
      this.cabinGroup.add(m, e);
    }
    this.scene.add(this.cabinGroup);

    this.buildNetwork();

    // packets, pulses, halos
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(new Float32Array(MAX_PTS * 3), 3));
    pg.setAttribute('aColor', new BufferAttribute(new Float32Array(MAX_PTS * 3), 3));
    pg.setAttribute('aSize', new BufferAttribute(new Float32Array(MAX_PTS), 1));
    pg.setAttribute('aAlpha', new BufferAttribute(new Float32Array(MAX_PTS), 1));
    pg.setAttribute('aKind', new BufferAttribute(new Float32Array(MAX_PTS), 1));
    pg.setDrawRange(0, 0);
    this.ptsMat = new ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: ptsVert,
      fragmentShader: ptsFrag,
      transparent: true,
      depthWrite: false,
      blending: P.light ? NormalBlending : AdditiveBlending,
    });
    this.points = new Points(pg, this.ptsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.scene.add(this.points);
  }

  private cabinLineMatLazy(): LineBasicMaterial {
    if (!this.cabinLineMat) {
      this.cabinLineMat = new LineBasicMaterial({
        color: this.pal.line,
        transparent: true,
        opacity: this.pal.light ? 0.3 : 0.24,
        depthWrite: false,
      });
    }
    return this.cabinLineMat;
  }

  private buildNetwork() {
    const P = this.pal;
    for (const n of NODES) {
      const pl = place(n.id);
      const [w, h, d] = pl.size;
      const geo = pl.shape === 'sensor' ? new SphereGeometry(w / 2, 20, 14) : new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.22);
      const color = n.kind === 'junction' ? P.junction : P.domain[n.domain];
      const mat = new MeshStandardMaterial({
        color,
        roughness: 0.42,
        metalness: 0.12,
        emissive: n.kind === 'junction' ? P.medium.can : color,
        emissiveIntensity: n.kind === 'junction' ? 0.12 : 0.2,
        transparent: true,
      });
      const mesh = new Mesh(geo, mat);
      mesh.userData.hit = { kind: 'node', id: n.id } satisfies Hit;
      const outlineMat = new MeshBasicMaterial({
        color: P.accent,
        side: BackSide,
        transparent: true,
        opacity: 0,
      });
      const outline = new Mesh(geo, outlineMat);
      outline.scale.setScalar(1.18);
      const group = new Group();
      group.position.copy(pl.pos);
      group.add(outline, mesh);
      const extras: Mesh[] = [];
      if (n.terminator) {
        // the 120 Ω terminating resistor inside the module
        const r = new Mesh(
          new CylinderGeometry(0.014, 0.014, 0.07, 12),
          new MeshStandardMaterial({
            color: P.medium.can,
            emissive: P.medium.can,
            emissiveIntensity: 0.5,
          }),
        );
        r.rotation.z = Math.PI / 2;
        r.position.set(0, h / 2 + 0.02, 0);
        group.add(r);
        extras.push(r);
      }
      if (n.id === 'valves') {
        // tire-pressure sensors in the other three wheels
        for (const p of valvePositions().slice(0, 3)) {
          const m = new Mesh(geo, mat);
          m.position.copy(p).sub(pl.pos);
          m.userData.hit = { kind: 'node', id: n.id } satisfies Hit;
          group.add(m);
          extras.push(m);
        }
      }
      this.scene.add(group);
      this.nodes.set(n.id, {
        node: n,
        group,
        mesh,
        mat,
        outline,
        outlineMat,
        pos: pl.pos.clone(),
        anchor: pl.pos.clone().add(new Vector3(0, h / 2 + 0.03, 0)),
        extras,
      });
    }

    for (const e of EDGES) {
      const r = route(e);
      const group = new Group();
      const mats: MeshStandardMaterial[] = [];
      const colors: Color[] = [];
      const mk = (c: Color) => {
        const m = new MeshStandardMaterial({
          color: c,
          roughness: 0.38,
          metalness: 0.05,
          emissive: c,
          emissiveIntensity: 0.3,
          transparent: true,
        });
        mats.push(m);
        colors.push(c.clone());
        return m;
      };
      if (e.medium === 'can' || e.medium === 'local') {
        const main = !!e.main;
        const [a, b] = twistedPair(r.pts, main ? 0.0098 : 0.008, 0.08);
        const rc = main ? 0.0078 : 0.0063;
        const hi = e.medium === 'can' ? P.medium.can : P.medium.local;
        const lo = e.medium === 'can' ? P.medium.canL : P.medium.localL;
        group.add(new Mesh(tube(a, rc, 7), mk(hi)), new Mesh(tube(b, rc, 7), mk(lo)));
      } else if (e.medium === 'rf') {
        const all = [r.pts, ...(r.extra ?? [])];
        group.add(new Mesh(merge(all.map((p) => dashedTube(p, 0.0065, 0.055, 0.045))), mk(P.medium.rf)));
      } else {
        const rad = e.medium === 'lin' ? 0.0078 : e.medium === 'video' ? 0.0088 : 0.006;
        group.add(new Mesh(tube(r.pts, rad, 7), mk(P.medium[e.medium])));
      }
      const hitGeo = merge([r.pts, ...(r.extra ?? [])].map((p) => tube(p, 0.035, 5)));
      const hit = new Mesh(
        hitGeo,
        new MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
        }),
      );
      hit.userData.hit = { kind: 'edge', id: e.id } satisfies Hit;
      group.add(hit);
      this.scene.add(group);
      this.edges.set(e.id, {
        edge: e,
        group,
        mats,
        colors,
        hit,
        pts: r.pts,
        cum: cumulative(r.pts),
        extra: (r.extra ?? []).map((p) => ({ pts: p, cum: cumulative(p) })),
      });
    }
  }

  // ───────────── public API ─────────────

  setPresent(nodeIds: string[], edgeIds: string[]) {
    this.present = new Set(nodeIds);
    this.presentEdges = new Set(edgeIds);
    this.refreshStyles();
  }

  setLayers(l: Layers) {
    this.layers = l;
    this.refreshStyles();
  }

  setSelection(selected: string | null, selectedEdge: string | null) {
    this.selected = selected;
    this.selectedEdge = selectedEdge;
    this.refreshStyles();
  }

  setFocusHover(id: string | null) {
    this.focusHover = id;
    this.refreshStyles();
  }

  setSilent(id: string | null) {
    this.silent = id;
    this.refreshStyles();
  }

  setTraffic(packets: Packet[], pulses: Pulse[], pulseMs: number) {
    this.packets = packets;
    this.pulses = pulses;
    this.pulseMs = pulseMs;
    this.dirty = true;
  }

  setShell(mode: ShellMode) {
    this.shellMesh.visible = mode === 'glass';
    this.capMesh.visible = mode === 'glass';
    this.dirty = true;
  }

  setCabin(on: boolean) {
    this.cabinGroup.visible = on;
    this.dirty = true;
  }

  setSpin(on: boolean) {
    this.controls.autoRotate = on && !this.reduced;
    this.dirty = true;
  }

  setReduced(r: boolean) {
    this.reduced = r;
    if (r) this.controls.autoRotate = false;
  }

  /** Shift the picture away from an open side drawer (pixels of the drawer's width, signed: + = drawer on the right). */
  setDrawer(px: number) {
    this.viewShiftTarget = px;
    if (this.reduced) this.viewShift = px;
    this.dirty = true;
  }

  bindLabels(b: LabelBinding | null) {
    this.labels = b;
    this.labelSize.clear();
    this.lastLabel.clear();
    this.dirty = true;
  }

  remeasureLabels() {
    this.labelSize.clear();
    this.dirty = true;
  }

  /** Preset pose, pulled back on narrow viewports so the whole car stays in frame. */
  private fitPose(name: ViewName) {
    const v = VIEWS[name];
    const target = new Vector3(...v.target);
    const aspect = this.size.w / Math.max(1, this.size.h);
    const k = Math.max(1, VIEW_FIT[name] / aspect);
    return { pos: new Vector3(...v.pos).sub(target).multiplyScalar(k).add(target), target };
  }

  view(name: ViewName, animate = !this.reduced, dur = 950) {
    const f = this.fitPose(name);
    this.moveTo(f.pos, f.target, animate, dur);
  }

  focusNode(id: string) {
    const o = this.nodes.get(id);
    if (!o) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const target = o.pos.clone();
    this.moveTo(target.clone().add(dir.multiplyScalar(2.3)), target, !this.reduced, 900);
  }

  nudge(dTheta: number, dPhi: number) {
    this.tween = null;
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(off);
    s.theta += dTheta;
    s.phi = clamp(s.phi + dPhi, 0.02, Math.PI - 0.02);
    off.setFromSpherical(s);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
    this.dirty = true;
  }

  pan(dx: number, dy: number) {
    this.tween = null;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0).multiplyScalar(dx * dist * 0.08);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1).multiplyScalar(dy * dist * 0.08);
    const d = right.add(up);
    this.camera.position.add(d);
    this.controls.target.add(d);
    this.controls.update();
    this.dirty = true;
  }

  zoom(factor: number) {
    this.tween = null;
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
    this.controls.update();
    this.dirty = true;
  }

  /** Horizontal position (0…1 of the canvas width) of a module on screen. */
  screenX(id: string): number | null {
    const o = this.nodes.get(id);
    if (!o) return null;
    const v = o.pos.clone().project(this.camera);
    return (v.x + 1) / 2;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.mo.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('dblclick', this.onDbl);
    c.removeEventListener('contextmenu', this.onContext);
    c.removeEventListener('webglcontextlost', this.onLost);
    this.controls.dispose();
    const geos = new Set<BufferGeometry>();
    const mats = new Set<Material>();
    this.scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.geometry) geos.add(m.geometry);
      const mm = m.material as Material | Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
      else if (mm) mats.add(mm);
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => {
      const map = (m as MeshBasicMaterial).map;
      if (map) map.dispose();
      m.dispose();
    });
    this.renderer.dispose();
  }

  onContextLost: (() => void) | null = null;

  // ───────────── internals ─────────────

  private moveTo(pos: Vector3, target: Vector3, animate: boolean, dur: number) {
    if (!animate) {
      this.tween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.dirty = true;
      return;
    }
    const fromS = new Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const toS = new Spherical().setFromVector3(pos.clone().sub(target));
    // turn the short way round
    let dt = toS.theta - fromS.theta;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    toS.theta = fromS.theta + dt;
    this.tween = {
      t0: performance.now(),
      dur,
      fromT: this.controls.target.clone(),
      toT: target.clone(),
      fromS,
      toS,
    };
    this.dirty = true;
  }

  private resize() {
    const r = this.wrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.applyViewOffset();
    this.ptsMat.uniforms.uScale.value =
      this.renderer.getDrawingBufferSize(new Vector2()).y / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.labelSize.clear();
    this.dirty = true;
  }

  private applyViewOffset() {
    const { w, h } = this.size;
    const s = Math.round(Math.abs(this.viewShift));
    if (s < 1) {
      this.camera.clearViewOffset();
      this.camera.aspect = w / h;
    } else {
      const full = w + s;
      this.camera.aspect = full / h;
      this.camera.setViewOffset(full, h, this.viewShift > 0 ? s : 0, 0, w, h);
    }
    this.camera.updateProjectionMatrix();
  }

  private applyTheme() {
    const P = readPalette();
    this.pal = P;
    const set = (m: ShaderMaterial, c: Color) => (m.uniforms.uColor.value as Color).copy(c);
    set(this.shellMat, P.shell);
    set(this.glassMat, P.glass);
    set(this.lineMat, P.line);
    set(this.accentMat, P.accentLine);
    set(this.cabinMat, P.shell);
    this.shellMat.uniforms.uBase.value = P.light ? 0.03 : 0.035;
    this.shellMat.uniforms.uRim.value = P.light ? 0.2 : 0.26;
    this.lineMat.uniforms.uFront.value = P.light ? 0.42 : 0.38;
    this.cabinLineMat.color.copy(P.line);
    this.cabinLineMat.opacity = P.light ? 0.3 : 0.24;
    this.hemi.intensity = P.light ? 1.6 : 1.25;
    this.gridMat.opacity = P.light ? 0.22 : 0.16;
    const gc = this.grid.geometry.getAttribute('color');
    for (let i = 0; i < gc.count; i++) gc.setXYZ(i, P.grid.r, P.grid.g, P.grid.b);
    gc.needsUpdate = true;
    this.shadowMat.opacity = P.light ? 0.32 : 0.75;
    if (this.wheelMats) {
      this.wheelMats.tire.color.copy(P.tire);
      this.wheelMats.hub.color.copy(P.tire);
      this.wheelMats.cover.color.copy(P.cover);
    }
    if (this.lightMats) {
      this.lightMats.head.color.set(P.light ? '#8fa7bd' : '#eaf4ff');
      this.lightMats.grille.color.set(P.light ? '#20272e' : '#05070a');
      this.lightMats.slot.color.set(P.light ? '#5c6670' : '#3a4550');
      this.lightMats.plate.color.set(P.light ? '#e9edf0' : '#c6ced6');
    }
    this.ptsMat.blending = P.light ? NormalBlending : AdditiveBlending;
    this.ptsMat.needsUpdate = true;
    for (const o of this.nodes.values()) {
      const c = o.node.kind === 'junction' ? P.junction : P.domain[o.node.domain];
      o.mat.color.copy(c);
      o.mat.emissive.copy(o.node.kind === 'junction' ? P.medium.can : c);
      o.outlineMat.color.copy(P.accent);
    }
    for (const o of this.edges.values()) {
      const e = o.edge;
      const cols: Color[] =
        e.medium === 'can'
          ? [P.medium.can, P.medium.canL]
          : e.medium === 'local'
            ? [P.medium.local, P.medium.localL]
            : [P.medium[e.medium]];
      o.colors = cols.map((c) => c.clone());
    }
    this.refreshStyles();
  }

  private layerOn(e: Edge) {
    return this.layers[MEDIUM_LAYER[e.medium]];
  }

  private refreshStyles() {
    const P = this.pal;
    const sel = this.selected;
    const selE = this.selectedEdge ? this.edges.get(this.selectedEdge)?.edge : undefined;
    const hovNode = this.hovered?.kind === 'node' ? this.hovered.id : this.focusHover;
    const hovEdge = this.hovered?.kind === 'edge' ? this.hovered.id : null;
    const focusing = !!sel || !!selE;
    const neighbors = new Set<string>();
    if (sel) neighbors.add(sel);
    if (selE) neighbors.add(selE.from).add(selE.to);

    for (const o of this.edges.values()) {
      const e = o.edge;
      const vis = this.presentEdges.has(e.id) && this.layerOn(e);
      o.group.visible = vis;
      if (!vis) continue;
      const related = sel ? e.from === sel || e.to === sel : selE ? e.id === selE.id : true;
      if (sel && related) neighbors.add(e.from).add(e.to);
      const cut = !!this.silent && (e.from === this.silent || e.to === this.silent) && (e.medium === 'can' || e.medium === 'local');
      const hot = (focusing && related) || hovEdge === e.id;
      o.mats.forEach((m, i) => {
        const c = cut ? P.muted : (o.colors[i] ?? o.colors[0]);
        m.color.copy(c);
        m.emissive.copy(c);
        m.emissiveIntensity = cut ? 0.05 : hot ? 0.75 : 0.3;
        const op = cut ? 0.4 : focusing && !related ? 0.16 : 1;
        m.opacity = op;
        m.depthWrite = op > 0.99;
      });
    }
    for (const o of this.nodes.values()) {
      const id = o.node.id;
      const vis = this.present.has(id);
      o.group.visible = vis;
      if (!vis) continue;
      const isSel = id === sel;
      const isHov = id === hovNode;
      const dim = focusing && !neighbors.has(id) && !isHov;
      const dead = id === this.silent;
      const base = dead ? P.danger : o.node.kind === 'junction' ? P.junction : P.domain[o.node.domain];
      o.mat.color.copy(base);
      o.mat.emissive.copy(dead ? P.danger : o.node.kind === 'junction' ? P.medium.can : base);
      o.mat.emissiveIntensity = isSel ? 0.85 : isHov ? 0.6 : dead ? 0.35 : o.node.kind === 'junction' ? 0.12 : 0.2;
      o.mat.opacity = dim ? 0.28 : 1;
      o.mat.depthWrite = !dim;
      o.outlineMat.opacity = isSel ? 0.9 : isHov ? 0.55 : 0;
      o.outlineMat.color.copy(dead ? P.danger : P.accent);
    }
    this.dirty = true;
  }

  private pickAt(clientX: number, clientY: number): Hit | null {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const objs: Object3D[] = [];
    for (const o of this.nodes.values()) if (o.group.visible) objs.push(o.mesh, ...o.extras.filter((m) => m.userData.hit));
    for (const o of this.edges.values()) if (o.group.visible) objs.push(o.hit);
    const hits = this.raycaster.intersectObjects(objs, false);
    // prefer modules over wires when both are under the pointer
    const node = hits.find((h) => (h.object.userData.hit as Hit).kind === 'node');
    const first = node && hits[0] && node.distance - hits[0].distance < 0.4 ? node : hits[0];
    return first ? (first.object.userData.hit as Hit) : null;
  }

  private onDown = (ev: PointerEvent) => {
    this.down = {
      x: ev.clientX,
      y: ev.clientY,
      t: performance.now(),
      button: ev.button,
    };
    this.dragged = false;
  };

  private onMove = (ev: PointerEvent) => {
    if (this.down && Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y) > 5) this.dragged = true;
    this.lastPointer = { x: ev.clientX, y: ev.clientY };
    this.hoverDirty = true;
    this.dirty = true;
  };
  private lastPointer: { x: number; y: number } | null = null;

  private onUp = (ev: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || this.dragged || d.button !== 0 || performance.now() - d.t > 700) return;
    this.cb.pick(this.pickAt(ev.clientX, ev.clientY), false);
  };

  private onDbl = (ev: MouseEvent) => {
    const hit = this.pickAt(ev.clientX, ev.clientY);
    if (hit?.kind === 'node') this.focusNode(hit.id);
    this.cb.pick(hit, true);
  };

  private onLeave = () => {
    this.lastPointer = null;
    if (this.hovered) {
      this.hovered = null;
      this.canvas.style.cursor = '';
      this.cb.hover(null, 0, 0);
      this.refreshStyles();
    }
  };

  private onContext = (ev: Event) => ev.preventDefault();

  private onLost = (ev: Event) => {
    ev.preventDefault();
    this.onContextLost?.();
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.tween) {
      const k = clamp((now - this.tween.t0) / this.tween.dur, 0, 1);
      const e = easeInOutCubic(k);
      const s = new Spherical(
        this.tween.fromS.radius + (this.tween.toS.radius - this.tween.fromS.radius) * e,
        this.tween.fromS.phi + (this.tween.toS.phi - this.tween.fromS.phi) * e,
        this.tween.fromS.theta + (this.tween.toS.theta - this.tween.fromS.theta) * e,
      );
      const t = this.tween.fromT.clone().lerp(this.tween.toT, e);
      this.controls.target.copy(t);
      this.camera.position.copy(t).add(new Vector3().setFromSpherical(s));
      if (k >= 1) this.tween = null;
      this.dirty = true;
    }
    if (Math.abs(this.viewShift - this.viewShiftTarget) > 0.5) {
      this.viewShift += (this.viewShiftTarget - this.viewShift) * Math.min(1, dt * 7);
      if (Math.abs(this.viewShift - this.viewShiftTarget) <= 0.5) this.viewShift = this.viewShiftTarget;
      this.applyViewOffset();
      this.dirty = true;
    }
    if (this.controls.update(dt)) this.dirty = true;
    if (this.controls.autoRotate) this.dirty = true;

    if (this.hoverDirty && this.lastPointer && !this.down) {
      this.hoverDirty = false;
      const hit = this.pickAt(this.lastPointer.x, this.lastPointer.y);
      const same = hit?.kind === this.hovered?.kind && hit?.id === this.hovered?.id;
      if (!same) {
        this.hovered = hit;
        this.canvas.style.cursor = hit ? 'pointer' : '';
        this.refreshStyles();
      }
      this.cb.hover(hit, this.lastPointer.x, this.lastPointer.y);
    }

    const animating = this.updatePoints(now);
    if (!this.dirty && !animating) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  };

  private updatePoints(now: number): boolean {
    const P = this.pal;
    const geo = this.points.geometry;
    const pos = geo.getAttribute('position') as BufferAttribute;
    const col = geo.getAttribute('aColor') as BufferAttribute;
    const size = geo.getAttribute('aSize') as BufferAttribute;
    const alpha = geo.getAttribute('aAlpha') as BufferAttribute;
    const kind = geo.getAttribute('aKind') as BufferAttribute;
    let n = 0;
    let active = false;
    const tmp = new Vector3();
    const add = (p: Vector3, c: Color, s: number, a: number, k: number) => {
      if (n >= MAX_PTS) return;
      pos.setXYZ(n, p.x, p.y, p.z);
      col.setXYZ(n, c.r, c.g, c.b);
      size.setX(n, s);
      alpha.setX(n, a);
      kind.setX(n, k);
      n++;
    };
    for (const p of this.packets) {
      if (now < p.start || now > p.start + p.dur) {
        if (now < p.start) active = true;
        continue;
      }
      active = true;
      const o = this.edges.get(p.edge);
      if (!o || !o.group.visible) continue;
      let f = (now - p.start) / p.dur;
      if (p.reverse) f = 1 - f;
      const c = p.medium === 'local' ? P.medium.local : p.medium === 'can' ? P.medium.can : P.medium[p.medium];
      add(pointAlong(o.pts, o.cum, f, tmp), c, 0.2, 1, 0);
      for (const x of o.extra) add(pointAlong(x.pts, x.cum, f, tmp), c, 0.2, 1, 0);
    }
    for (const q of this.pulses) {
      const k = (now - q.start) / this.pulseMs;
      if (k < 0) {
        active = true;
        continue;
      }
      if (k > 1) continue;
      active = true;
      const o = this.nodes.get(q.node);
      if (!o || !o.group.visible) continue;
      add(o.pos, q.kind === 'send' ? P.accent : P.ok, 0.16 + 0.55 * k, Math.pow(1 - k, 1.4), 1);
    }
    const halo = (id: string | null, s: number, a: number) => {
      const o = id ? this.nodes.get(id) : null;
      if (o && o.group.visible) add(o.pos, id === this.silent ? P.danger : P.accent, s, a, 2);
    };
    if (this.selected) {
      const breathe = this.reduced ? 1 : 0.82 + 0.18 * Math.sin(now / 420);
      halo(this.selected, 0.62 * breathe, 0.75);
      if (!this.reduced) active = true;
    }
    const hov = this.hovered?.kind === 'node' ? this.hovered.id : this.focusHover;
    if (hov && hov !== this.selected) halo(hov, 0.48, 0.5);
    geo.setDrawRange(0, n);
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = alpha.needsUpdate = kind.needsUpdate = true;
    return active;
  }

  private placeLabels() {
    const L = this.labels;
    if (!L) return;
    const { w: W, h: H } = this.size;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const v = new Vector3();
    const items: {
      id: string;
      el: HTMLElement;
      ax: number;
      ay: number;
      pr: number;
    }[] = [];
    for (const [id, el] of L.labels) {
      const o = this.nodes.get(id);
      if (!o || !o.group.visible) {
        this.hideLabel(id, el, L.leaders.get(id));
        continue;
      }
      v.copy(o.anchor).project(this.camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) {
        this.hideLabel(id, el, L.leaders.get(id));
        continue;
      }
      items.push({
        id,
        el,
        ax: ((v.x + 1) / 2) * W,
        ay: ((1 - v.y) / 2) * H,
        pr: L.priority(id),
      });
    }
    items.sort((a, b) => b.pr - a.pr);
    const fits = (r: { x: number; y: number; w: number; h: number }) => {
      if (r.x < 6 || r.y < 6 || r.x + r.w > W - 6 || r.y + r.h > H - 6) return false;
      for (const p of placed) if (r.x < p.x + p.w + 5 && r.x + r.w + 5 > p.x && r.y < p.y + p.h + 4 && r.y + r.h + 4 > p.y) return false;
      return true;
    };
    for (const it of items) {
      let sz = this.labelSize.get(it.id);
      if (!sz) {
        sz = { w: it.el.offsetWidth, h: it.el.offsetHeight };
        this.labelSize.set(it.id, sz);
      }
      const { w, h } = sz;
      const c: [number, number][] = [
        [-w / 2, -h - 18],
        [16, -h / 2],
        [-w - 16, -h / 2],
        [-w / 2, 18],
        [-w / 2, -h - 46],
        [34, -h - 10],
        [-w - 34, -h - 10],
        [34, 10],
        [-w - 34, 10],
        [-w / 2, 46],
        [-w / 2, -h - 76],
        [-w / 2, 76],
      ];
      let best: { x: number; y: number; w: number; h: number } | null = null;
      for (const [dx, dy] of c) {
        const r = { x: it.ax + dx, y: it.ay + dy, w, h };
        if (fits(r)) {
          best = r;
          break;
        }
      }
      if (!best && it.pr >= 90)
        best = {
          x: clamp(it.ax - w / 2, 6, W - w - 6),
          y: clamp(it.ay - h - 18, 6, H - h - 6),
          w,
          h,
        };
      const line = L.leaders.get(it.id);
      if (!best) {
        this.hideLabel(it.id, it.el, line);
        continue;
      }
      placed.push(best);
      const key = `${Math.round(best.x)},${Math.round(best.y)}`;
      if (this.lastLabel.get(it.id) !== key) {
        it.el.style.transform = `translate3d(${Math.round(best.x)}px, ${Math.round(best.y)}px, 0)`;
        it.el.style.opacity = '1';
        it.el.style.pointerEvents = 'auto';
        this.lastLabel.set(it.id, key);
      }
      if (line) {
        const ex = clamp(it.ax, best.x + 4, best.x + w - 4);
        const ey = clamp(it.ay, best.y, best.y + h);
        line.setAttribute('x1', it.ax.toFixed(1));
        line.setAttribute('y1', it.ay.toFixed(1));
        line.setAttribute('x2', ex.toFixed(1));
        line.setAttribute('y2', ey.toFixed(1));
        line.style.opacity = '1';
      }
    }
    // ground tags last, only where there is room
    GROUND_TAGS.forEach((t, i) => {
      const el = L.tags[i];
      if (!el) return;
      v.set(...t.pos).project(this.camera);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = {
        x: ((v.x + 1) / 2) * W - w / 2,
        y: ((1 - v.y) / 2) * H - h / 2,
        w,
        h,
      };
      if (v.z > 1 || !fits(r)) {
        el.style.opacity = '0';
        return;
      }
      placed.push(r);
      el.style.transform = `translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0)`;
      el.style.opacity = '1';
    });
  }

  private hideLabel(id: string, el: HTMLElement, line?: SVGLineElement) {
    if (this.lastLabel.get(id) !== 'hidden') {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      this.lastLabel.set(id, 'hidden');
    }
    if (line) line.style.opacity = '0';
  }
}
