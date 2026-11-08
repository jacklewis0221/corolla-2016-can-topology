import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { Armchair, Box, Focus, Orbit, RotateCcw } from 'lucide-react';
import { NODE_BY_ID, type NetNode } from '../data/nodes';
import { EDGE_BY_ID, MEDIUM_LABEL } from '../data/edges';
import { nodeLabel, presentEdges, presentNodes, type Layers, type Opts, type Packet, type Pulse } from '../lib/model';
import { CarScene, VIEWS, type Hit, type ShellMode, type ViewName } from '../three/scene';
import { GROUND_TAGS } from '../three/layout';

export interface Car3DProps {
  opts: Opts;
  layers: Layers;
  selected: string | null;
  selectedEdge: string | null;
  silent: string | null;
  dtcBadges?: Record<string, string[]>;
  packets: Packet[];
  pulses: Pulse[];
  pulseMs: number;
  drawer: 'left' | 'right' | null;
  reduced: boolean;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onBackground: () => void;
  screenXRef?: MutableRefObject<((id: string) => number | null) | null>;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function label3d(n: NetNode): string {
  if (n.kind === 'junction') return n.id === 'jc3' ? 'No. 3 J/C' : n.id === 'jc2' ? 'No. 2 J/C' : 'No. 1 J/C';
  if (n.id === 'dlc3') return 'DLC3 (OBD-II)';
  return nodeLabel(n);
}

const VIEW_ORDER: ViewName[] = ['iso', 'side', 'top', 'front', 'rear'];

function Car3D(p: Car3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CarScene | null>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const leaderEls = useRef(new Map<string, SVGLineElement>());
  const tagEls = useRef<HTMLElement[]>([]);
  const [failed, setFailed] = useState<string | null>(() =>
    webglAvailable() ? null : 'This browser cannot draw 3D graphics (WebGL is off).',
  );
  const [view, setView] = useState<ViewName | null>('iso');
  const [spin, setSpin] = useState(false);
  const [shell, setShell] = useState<ShellMode>('glass');
  const [cabin, setCabin] = useState(true);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [labelFocus, setLabelFocus] = useState<string | null>(null);

  const nodes = useMemo(() => presentNodes(p.opts), [p.opts]);
  const edges = useMemo(() => presentEdges(p.opts), [p.opts]);

  const live = useRef(p);
  live.current = p;
  const hoverRef = useRef<string | null>(null);

  const priority = useRef<(id: string) => number>(() => 0);
  priority.current = (id: string) => {
    const cur = live.current;
    if (id === cur.selected) return 100;
    if (id === cur.silent) return 97;
    if (id === labelFocus || id === hoverNode) return 95;
    if (cur.selectedEdge) {
      const e = EDGE_BY_ID[cur.selectedEdge];
      if (e && (e.from === id || e.to === id)) return 93;
    }
    if (cur.dtcBadges?.[id]?.length) return 88;
    const n = NODE_BY_ID[id];
    if (!n) return 0;
    if (n.kind === 'junction') return 22;
    if (n.can?.some((c) => c.bus === 'V bus')) return 60 + (n.terminator ? 5 : 0);
    if (n.kind === 'port') return 52;
    if (n.kind === 'ecu') return 45;
    return 30;
  };

  // create the scene once
  useEffect(() => {
    if (failed || !canvasRef.current || !wrapRef.current) return;
    let scene: CarScene;
    try {
      scene = new CarScene(
        canvasRef.current,
        wrapRef.current,
        {
          pick: (hit: Hit | null, dbl: boolean) => {
            const cur = live.current;
            if (!hit) {
              if (!dbl) cur.onBackground();
              return;
            }
            if (hit.kind === 'node') {
              if (cur.selected !== hit.id) cur.onSelectNode(hit.id);
            } else if (cur.selectedEdge !== hit.id) cur.onSelectEdge(hit.id);
          },
          hover: (hit: Hit | null, x: number, y: number) => {
            const key = hit ? `${hit.kind}:${hit.id}` : null;
            if (key !== hoverRef.current) {
              hoverRef.current = key;
              setHoverEdge(hit?.kind === 'edge' ? hit.id : null);
              setHoverNode(hit?.kind === 'node' ? hit.id : null);
            }
            const tip = tipRef.current;
            const wrap = wrapRef.current;
            if (tip && wrap && hit?.kind === 'edge') {
              const r = wrap.getBoundingClientRect();
              const left = Math.min(x - r.left + 16, r.width - 300);
              const top = Math.min(y - r.top + 18, r.height - 120);
              tip.style.transform = `translate3d(${Math.max(8, left)}px, ${Math.max(8, top)}px, 0)`;
            }
          },
          userMove: () => setView(null),
        },
        { reduced: live.current.reduced },
      );
    } catch {
      setFailed('The 3D view could not start on this device.');
      return;
    }
    sceneRef.current = scene;
    scene.bindLabels({
      labels: labelEls.current,
      leaders: leaderEls.current,
      tags: tagEls.current,
      priority: (id) => priority.current(id),
    });
    scene.onContextLost = () => setFailed('The graphics context was lost. Switch views to reload the 3D model.');
    const ref = live.current.screenXRef;
    if (ref) ref.current = (id: string) => scene.screenX(id);
    document.fonts?.ready.then(() => scene.remeasureLabels());
    return () => {
      scene.dispose();
      sceneRef.current = null;
      if (ref) ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useLayoutEffect(() => {
    sceneRef.current?.bindLabels({
      labels: labelEls.current,
      leaders: leaderEls.current,
      tags: tagEls.current,
      priority: (id) => priority.current(id),
    });
  }, [nodes, failed]);

  useEffect(
    () =>
      sceneRef.current?.setPresent(
        nodes.map((n) => n.id),
        edges.map((e) => e.id),
      ),
    [nodes, edges, failed],
  );
  useEffect(() => sceneRef.current?.setLayers(p.layers), [p.layers, failed]);
  useEffect(() => sceneRef.current?.setSelection(p.selected, p.selectedEdge), [p.selected, p.selectedEdge, failed]);
  useEffect(() => sceneRef.current?.setSilent(p.silent), [p.silent, failed]);
  useEffect(() => sceneRef.current?.setTraffic(p.packets, p.pulses, p.pulseMs), [p.packets, p.pulses, p.pulseMs, failed]);
  useEffect(() => sceneRef.current?.setShell(shell), [shell, failed]);
  useEffect(() => sceneRef.current?.setCabin(cabin), [cabin, failed]);
  useEffect(() => sceneRef.current?.setSpin(spin && !p.reduced), [spin, p.reduced, failed]);
  useEffect(() => sceneRef.current?.setReduced(p.reduced), [p.reduced, failed]);
  useEffect(() => sceneRef.current?.setFocusHover(labelFocus), [labelFocus, failed]);
  useEffect(() => sceneRef.current?.remeasureLabels(), [p.dtcBadges, p.silent, failed]);
  useEffect(() => {
    const w = wrapRef.current?.clientWidth ?? 0;
    const shift = w > 860 ? Math.min(470, w * 0.4) : 0;
    sceneRef.current?.setDrawer(p.drawer === 'right' ? shift : p.drawer === 'left' ? -shift : 0);
  }, [p.drawer, failed]);

  const goView = useCallback((v: ViewName) => {
    sceneRef.current?.view(v);
    setView(v);
  }, []);

  const select = (id: string) => {
    if (p.selected !== id) p.onSelectNode(id);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const s = sceneRef.current;
    if (!s) return;
    const k = e.key;
    if (k === 'ArrowLeft') e.shiftKey ? s.pan(-1, 0) : s.nudge(-0.2, 0);
    else if (k === 'ArrowRight') e.shiftKey ? s.pan(1, 0) : s.nudge(0.2, 0);
    else if (k === 'ArrowUp') e.shiftKey ? s.pan(0, 1) : s.nudge(0, -0.12);
    else if (k === 'ArrowDown') e.shiftKey ? s.pan(0, -1) : s.nudge(0, 0.12);
    else if (k === '+' || k === '=') s.zoom(0.85);
    else if (k === '-' || k === '_') s.zoom(1.18);
    else if (k === '0' || k === 'Home') return void (e.preventDefault(), goView('iso'));
    else if (/^[1-5]$/.test(k)) return void (e.preventDefault(), goView(VIEW_ORDER[Number(k) - 1]));
    else return;
    e.preventDefault();
    setView(null);
  };

  const he = hoverEdge ? EDGE_BY_ID[hoverEdge] : null;
  const barSide = p.drawer === 'right' ? 'left' : p.drawer === 'left' ? 'right' : 'center';

  if (failed) {
    return (
      <div className="car3d car3d--failed" data-testid="car3d">
        <div className="car3d__fail" role="status">
          <Box size={22} aria-hidden="true" />
          <p>{failed}</p>
          <p className="car3d__fail-sub">The schematic and the 2D in-car view show the same network.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="car3d" data-testid="car3d">
      <div
        className="car3d__viewport"
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-roledescription="3D model"
        aria-label="3D model of a 2016 Corolla with its data network. Drag to rotate, right-drag or Shift-drag to pan, scroll to zoom. When this area has focus: arrow keys rotate, Shift with arrows pans, plus and minus zoom, 1 to 5 pick a camera, 0 resets."
        onKeyDown={onKey}
        data-testid="car3d-viewport"
      >
        <canvas ref={canvasRef} className="car3d__canvas" aria-hidden="true" data-testid="car3d-canvas" />
        <svg className="car3d__leaders" aria-hidden="true">
          {nodes.map((n) => (
            <line
              key={n.id}
              ref={(el) => {
                if (el) leaderEls.current.set(n.id, el);
                else leaderEls.current.delete(n.id);
              }}
              className={`d-${n.domain}${n.id === p.selected ? ' is-on' : ''}`}
            />
          ))}
        </svg>
        <div className="car3d__labels">
          {nodes.map((n) => {
            const dtc = p.dtcBadges?.[n.id];
            const cls = [
              'l3d',
              `d-${n.domain}`,
              n.kind === 'junction' ? 'l3d--jc' : '',
              n.id === p.selected ? 'is-selected' : '',
              n.id === hoverNode || n.id === labelFocus ? 'is-hover' : '',
              n.id === p.silent ? 'is-dead' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={n.id}
                type="button"
                ref={(el) => {
                  if (el) labelEls.current.set(n.id, el);
                  else labelEls.current.delete(n.id);
                }}
                className={cls}
                aria-pressed={n.id === p.selected}
                aria-label={`${n.name}. ${n.location}.`}
                onClick={() => select(n.id)}
                onDoubleClick={() => {
                  select(n.id);
                  sceneRef.current?.focusNode(n.id);
                  setView(null);
                }}
                onMouseEnter={() => setLabelFocus(n.id)}
                onMouseLeave={() => setLabelFocus((f) => (f === n.id ? null : f))}
                onFocus={() => setLabelFocus(n.id)}
                onBlur={() => setLabelFocus((f) => (f === n.id ? null : f))}
                data-testid={`car3d-label-${n.id}`}
              >
                <span className="l3d__dot" aria-hidden="true" />
                <span className="l3d__name">{label3d(n)}</span>
                {n.terminator && <span className="l3d__ohm">120 Ω</span>}
                {n.id === p.silent && <span className="l3d__off">unplugged</span>}
                {dtc && dtc.length > 0 && (
                  <span className="l3d__dtc">
                    {dtc[0]}
                    {dtc.length > 1 ? ` +${dtc.length - 1}` : ''}
                  </span>
                )}
              </button>
            );
          })}
          {GROUND_TAGS.map((t, i) => (
            <span
              key={t.text}
              className="car3d__tag"
              aria-hidden="true"
              ref={(el) => {
                if (el) tagEls.current[i] = el;
              }}
            >
              {t.text === 'FRONT' ? 'FRONT →' : t.text}
            </span>
          ))}
        </div>
        <div className={`tooltip car3d__tip${he ? ' is-on' : ''}`} ref={tipRef} role="tooltip" aria-hidden={!he}>
          {he && (
            <>
              <div className={`tooltip__medium m-${he.medium}`}>{MEDIUM_LABEL[he.medium]}</div>
              <div className="tooltip__title">{he.label}</div>
              <div className="tooltip__body">{he.detail}</div>
            </>
          )}
        </div>
        <p className="car3d__hint" aria-hidden="true">
          <span className="car3d__hint-mouse">
            Drag to rotate · right-drag or Shift-drag to pan · scroll to zoom · double-click a module to fly to it
          </span>
          <span className="car3d__hint-touch">Drag to rotate · pinch to zoom · two fingers to pan</span>
        </p>
      </div>

      <div className={`car3d__bar car3d__bar--${barSide}`} role="toolbar" aria-label="3D camera and display" data-testid="car3d-bar">
        <div className="car3d__views" role="group" aria-label="Camera">
          {VIEW_ORDER.map((v, i) => (
            <button
              key={v}
              type="button"
              className={`car3d__btn${view === v ? ' is-on' : ''}`}
              aria-pressed={view === v}
              onClick={() => goView(v)}
              title={`${VIEWS[v].label} (key ${i + 1})`}
              aria-label={VIEWS[v].label}
              data-testid={`car3d-view-${v}`}
            >
              {VIEWS[v].short}
            </button>
          ))}
        </div>
        <span className="car3d__sep" aria-hidden="true" />
        <button
          type="button"
          className="car3d__btn car3d__btn--icon"
          onClick={() => goView('iso')}
          title="Reset the camera (key 0)"
          aria-label="Reset the camera"
          data-testid="car3d-reset"
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span className="car3d__btn-text">Reset</span>
        </button>
        {p.selected && (
          <button
            type="button"
            className="car3d__btn car3d__btn--icon"
            onClick={() => {
              sceneRef.current?.focusNode(p.selected!);
              setView(null);
            }}
            title="Fly the camera to the selected module"
            aria-label="Fly to the selected module"
            data-testid="car3d-focus"
          >
            <Focus size={16} aria-hidden="true" />
            <span className="car3d__btn-text">Fly to</span>
          </button>
        )}
        <button
          type="button"
          className={`car3d__btn car3d__btn--icon${spin && !p.reduced ? ' is-on' : ''}`}
          aria-pressed={spin && !p.reduced}
          disabled={p.reduced}
          onClick={() => setSpin((s) => !s)}
          title={p.reduced ? 'Turntable is off because your system asks for reduced motion' : 'Slowly turn the car'}
          aria-label="Spin"
          data-testid="car3d-spin"
        >
          <Orbit size={16} aria-hidden="true" />
          <span className="car3d__btn-text">Spin</span>
        </button>
        <span className="car3d__sep" aria-hidden="true" />
        <div className="car3d__views" role="radiogroup" aria-label="Body">
          {(['glass', 'frame'] as ShellMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={shell === m}
              className={`car3d__btn${shell === m ? ' is-on' : ''}`}
              onClick={() => setShell(m)}
              data-testid={`car3d-shell-${m}`}
            >
              {m === 'glass' ? 'Glass' : 'Frame'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`car3d__btn car3d__btn--icon${cabin ? ' is-on' : ''}`}
          aria-pressed={cabin}
          onClick={() => setCabin((c) => !c)}
          title="Show seats, dash and engine for reference"
          aria-label="Interior"
          data-testid="car3d-cabin"
        >
          <Armchair size={16} aria-hidden="true" />
          <span className="car3d__btn-text">Interior</span>
        </button>
      </div>
    </div>
  );
}

export default memo(Car3D);
