import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Car, Network } from 'lucide-react';
import { Diagram } from './Diagram';
import { Inspector, silenceReport } from './Inspector';
import { Legend } from './Legend';
import { Segmented, ToggleChip, SectionHead } from './ui';
import { LAYER_LABEL, type Layer } from '../data/edges';
import { MESSAGES, hex } from '../data/messages';
import { ALL_LAYERS, PRESETS, presentEdges, presentNodes, scheduleBroadcast, type Layers } from '../lib/model';
import { useMorph, usePrefersReducedMotion, useTraffic } from '../lib/hooks';
import { isPresent, NODE_BY_ID } from '../data/nodes';
import { EDGE_BY_ID } from '../data/edges';

type PresetKey = keyof typeof PRESETS;

export function Topology() {
  const reduced = usePrefersReducedMotion();
  const [view, setView] = useState<'schematic' | 'car'>('schematic');
  const [preset, setPreset] = useState<PresetKey>('base');
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [silent, setSilent] = useState<string | null>(null);
  const [live, setLive] = useState(!reduced);
  const opts = PRESETS[preset].opts;
  const t = useMorph(view === 'car' ? 1 : 0, reduced);
  const traffic = useTraffic();
  const tRef = useRef(t);
  tRef.current = t;

  const nodes = useMemo(() => presentNodes(opts), [opts]);
  const edges = useMemo(() => presentEdges(opts), [opts]);

  // clear selections that disappear with a preset change
  useEffect(() => {
    if (selected && !nodes.some((n) => n.id === selected)) setSelected(null);
    if (silent && !nodes.some((n) => n.id === silent)) setSilent(null);
    if (selectedEdge && !edges.some((e) => e.id === selectedEdge)) setSelectedEdge(null);
  }, [nodes, edges, selected, silent, selectedEdge]);

  const senders = useMemo(
    () =>
      MESSAGES.filter(
        (m) =>
          m.sender &&
          m.basis !== 'diagnostic' &&
          m.basis !== 'unknown' &&
          nodes.some((n) => n.id === m.sender) &&
          (!m.requires || m.requires.every((o) => opts[o])),
      ),
    [nodes, opts],
  );

  const ping = useCallback(
    (from: string, msg: number | null) => {
      if (!layers.can) setLayers((l) => ({ ...l, can: true }));
      traffic.add(scheduleBroadcast(from, edges, performance.now(), { label: msg !== null ? hex(msg) : undefined, t: tRef.current }));
    },
    [edges, traffic, layers.can],
  );

  // ambient bus traffic
  useEffect(() => {
    if (!live || reduced || !layers.can) return;
    let i = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const pool = senders.filter((m) => m.sender !== silent);
      if (!pool.length) return;
      const m = pool[(i * 7 + Math.floor(Math.random() * pool.length)) % pool.length];
      i++;
      traffic.add(scheduleBroadcast(m.sender!, edges, performance.now(), { label: hex(m.id), t: tRef.current }));
    }, 1300);
    return () => window.clearInterval(timer);
  }, [live, reduced, layers.can, senders, edges, silent, traffic]);

  const report = useMemo(() => (silent ? silenceReport(silent, opts) : null), [silent, opts]);

  // open the drawer on the side away from what you clicked, so it stays visible
  const lastSide = useRef<'left' | 'right'>('right');
  const side = useMemo(() => {
    const xOf = (id: string) => {
      const n = NODE_BY_ID[id];
      return n ? (view === 'car' ? n.pos.p[0] : n.pos.s[0]) : 800;
    };
    let x: number | null = null;
    if (selected) x = xOf(selected);
    else if (selectedEdge && EDGE_BY_ID[selectedEdge]) x = (xOf(EDGE_BY_ID[selectedEdge].from) + xOf(EDGE_BY_ID[selectedEdge].to)) / 2;
    if (x !== null) lastSide.current = x > 800 ? 'left' : 'right';
    return lastSide.current;
  }, [selected, selectedEdge, view]);

  const selectNode = useCallback((id: string) => {
    setSelectedEdge(null);
    setSelected((s) => (s === id ? null : id));
  }, []);
  const selectEdge = useCallback((id: string) => {
    setSelected(null);
    setSelectedEdge((s) => (s === id ? null : id));
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    setSelectedEdge(null);
  }, []);

  const counts = useMemo(() => {
    const onCan = nodes.filter((n) => n.can?.some((c) => c.bus === 'V bus') && n.kind !== 'junction' && n.kind !== 'port').length;
    const lin = new Set(edges.filter((e) => e.medium === 'lin').map((e) => e.from)).size;
    return { onCan, lin, modules: nodes.filter((n) => n.kind !== 'junction' && n.kind !== 'port').length };
  }, [nodes, edges]);

  return (
    <section className="section section--topology" aria-labelledby="network-title" id="network">
      <div className="container">
        <SectionHead kicker="01 · The network" title="Every module, every wire that carries data" id="network-title">
          <p>
            One twisted pair — the CAN “V bus” — links {counts.onCan} control modules in this configuration. Gateways hang smaller LIN buses
            and serial lines off it, and hundreds of sensors and actuators are wired straight to the ECU that owns them. Click any module
            to open it; hover a wire for its exact pins.
          </p>
        </SectionHead>

        <div className="toolbar" role="toolbar" aria-label="Diagram controls" id="network-stage">
          <div className="toolbar__group">
            <span className="toolbar__label">View</span>
            <Segmented
              label="View"
              testId="view"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'schematic',
                  label: (
                    <>
                      <Network size={15} aria-hidden="true" /> Schematic
                    </>
                  ),
                },
                {
                  value: 'car',
                  label: (
                    <>
                      <Car size={15} aria-hidden="true" /> In the car
                    </>
                  ),
                },
              ]}
            />
          </div>
          <div className="toolbar__group">
            <span className="toolbar__label">Equipment</span>
            <Segmented
              label="Equipment preset"
              testId="preset"
              value={preset}
              onChange={(v) => setPreset(v)}
              options={(Object.keys(PRESETS) as PresetKey[]).map((k) => ({ value: k, label: PRESETS[k].label, title: PRESETS[k].detail }))}
            />
          </div>
          <div className="toolbar__group toolbar__group--layers">
            <span className="toolbar__label">Layers</span>
            <div className="chips">
              {(Object.keys(LAYER_LABEL) as Layer[]).map((l) => (
                <ToggleChip key={l} on={layers[l]} onChange={(v) => setLayers((s) => ({ ...s, [l]: v }))} swatch={l} testId={`layer-${l}`}>
                  {LAYER_LABEL[l]}
                </ToggleChip>
              ))}
            </div>
          </div>
          <div className="toolbar__group toolbar__group--live">
            <ToggleChip on={live && !reduced} onChange={(v) => setLive(v)} testId="live-traffic">
              <Activity size={15} aria-hidden="true" /> Live traffic
            </ToggleChip>
          </div>
        </div>

        <div className="stage">
          <div className="stage__scroll">
            <Diagram
              opts={opts}
              layers={layers}
              t={t}
              selected={selected}
              selectedEdge={selectedEdge}
              silent={silent}
              dtcBadges={report?.badges}
              packets={traffic.packets}
              pulses={traffic.pulses}
              now={traffic.now}
              pulseMs={traffic.pulseMs}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onBackground={close}
              showIo={layers.wire}
              title={`Network topology of a 2016 Corolla ${PRESETS[preset].label}, ${view === 'car' ? 'in-car positions' : 'schematic view'}`}
              testId="topo"
            />
          </div>
          <Inspector
            side={side}
            nodeId={selected}
            edgeId={selectedEdge}
            opts={opts}
            silent={silent}
            onClose={close}
            onSilence={(id) => setSilent(id)}
            onPing={ping}
            onSelectNode={selectNode}
          />
          {silent && (
            <div className="stage__banner" role="status">
              <span>
                <b>{nodes.find((n) => n.id === silent)?.short}</b> is unplugged — red tags show the DTCs other modules store.
              </span>
              <button className="btn btn--sm" onClick={() => setSilent(null)} data-testid="banner-replug">
                Plug back in
              </button>
            </div>
          )}
        </div>
        <p className="stage__hint">Tip: on small screens, swipe sideways to pan the drawing.</p>
        <Legend opts={opts} />
        <div className="kpis kpis--inline">
          <div>
            <b>{counts.modules}</b>
            <span>modules drawn</span>
          </div>
          <div>
            <b>{counts.onCan}</b>
            <span>on the CAN V bus</span>
          </div>
          <div>
            <b>{counts.lin}</b>
            <span>LIN masters</span>
          </div>
          <div>
            <b>{nodes.reduce((a, n) => a + (n.io?.filter((i) => isPresent(i, opts)).length ?? 0), 0)}</b>
            <span>wired I/O listed</span>
          </div>
        </div>
      </div>
    </section>
  );
}
