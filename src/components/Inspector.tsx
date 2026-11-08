import { useEffect, useRef } from 'react';
import { MapPin, Radio, Unplug, X, PlugZap, ArrowRightLeft } from 'lucide-react';
import { NODE_BY_ID, DOMAIN_LABEL, type NetNode, type IoItem } from '../data/nodes';
import { EDGE_BY_ID, MEDIUM_LABEL } from '../data/edges';
import { MESSAGES, hex } from '../data/messages';
import { DTCS, FAILSAFE, LIN_DTCS, STOP_MODE_SELF } from '../data/diagnostics';
import { SourceLinks, Pill } from './ui';
import type { Opts } from '../lib/model';
import { isPresent } from '../data/nodes';

const WIRE_NAMES: Record<string, string> = {
  B: 'black',
  W: 'white',
  R: 'red',
  G: 'green',
  L: 'blue',
  Y: 'yellow',
  V: 'violet',
  P: 'pink',
  LG: 'light green',
  SB: 'sky blue',
  GR: 'gray',
  BR: 'brown',
  O: 'orange',
};

export function nameOf(id: string) {
  return NODE_BY_ID[id]?.short.split(' · ')[0] ?? id;
}

export function silenceReport(id: string, opts: Opts) {
  const present = (nid: string) => (NODE_BY_ID[nid] ? isPresent(NODE_BY_ID[nid], opts) : false);
  const others = DTCS.filter((d) => d.about === id).map((d) => ({ ...d, storedBy: d.storedBy.filter(present) }));
  const self = (STOP_MODE_SELF[id] ?? []).filter((c) => {
    const d = DTCS.find((x) => x.code === c);
    return !d || d.about === null || present(d.about);
  });
  const effects = FAILSAFE.filter((r) => r.needs.includes(id) && r.master.some(present));
  const lin = LIN_DTCS.filter((d) => d.about === id);
  const badges: Record<string, string[]> = {};
  for (const d of others) for (const s of d.storedBy) (badges[s] ??= []).includes(d.code) || badges[s].push(d.code);
  for (const d of lin) (badges[d.storedBy] ??= []).push(d.code);
  if (self.length) badges[id] = [...(badges[id] ?? []), ...self];
  return { others, self, effects, lin, badges };
}

function wire(c: string) {
  return WIRE_NAMES[c] ? `${c} (${WIRE_NAMES[c]})` : c;
}

const KIND_GLYPH: Record<IoItem['kind'], string> = {
  sensor: 'S',
  switch: 'SW',
  actuator: 'A',
  indicator: 'L',
  ecu: 'ECU',
  display: 'D',
  antenna: 'RF',
};

function CloseUp({ node, opts }: { node: NetNode; opts: Opts }) {
  const io = (node.io ?? []).filter((i) => isPresent(i, opts));
  if (!io.length) return null;
  const ins = io.filter((i) => i.dir === 'in');
  const outs = io.filter((i) => i.dir === 'out');
  const rows = Math.max(ins.length, outs.length);
  return (
    <section className="insp__sec">
      <h4>Wired inputs and outputs</h4>
      <p className="insp__hint">Everything here is a dedicated wire — CAN only carries what the ECU decides to share.</p>
      <div className="closeup" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
        <div className="closeup__col closeup__col--in">
          <span className="closeup__label">In</span>
          {ins.map((i) => (
            <div key={i.name} className={`io io--in k-${i.kind}`}>
              <span className="io__glyph" aria-hidden="true">
                {KIND_GLYPH[i.kind]}
              </span>
              <span className="io__name">
                {i.name}
                {i.pins && <span className="io__pins">{i.pins}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className={`closeup__ecu d-${node.domain}`} aria-hidden="true">
          <span>{node.short.split(' · ')[0]}</span>
        </div>
        <div className="closeup__col closeup__col--out">
          <span className="closeup__label">Out</span>
          {outs.map((i) => (
            <div key={i.name} className={`io io--out k-${i.kind}`}>
              <span className="io__glyph" aria-hidden="true">
                {KIND_GLYPH[i.kind]}
              </span>
              <span className="io__name">
                {i.name}
                {i.pins && <span className="io__pins">{i.pins}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="insp__legend">
        <b>S</b> sensor · <b>SW</b> switch · <b>A</b> actuator · <b>L</b> lamp · <b>D</b> display · <b>RF</b> antenna · <b>ECU</b> another module
      </p>
    </section>
  );
}

export function Inspector({
  nodeId,
  edgeId,
  opts,
  silent,
  onClose,
  onSilence,
  onPing,
  onSelectNode,
  side = 'right',
}: {
  side?: 'left' | 'right';
  nodeId: string | null;
  edgeId: string | null;
  opts: Opts;
  silent: string | null;
  onClose: () => void;
  onSilence: (id: string | null) => void;
  onPing: (id: string, msg: number | null) => void;
  onSelectNode: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const open = Boolean(nodeId || edgeId);
  useEffect(() => {
    if (open) ref.current?.scrollTo({ top: 0 });
  }, [nodeId, edgeId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // keep the last content on screen while the drawer slides out
  const last = useRef<{ nodeId: string | null; edgeId: string | null }>({ nodeId: null, edgeId: null });
  if (open) last.current = { nodeId, edgeId };
  const shownNode = open ? nodeId : last.current.nodeId;
  const shownEdge = open ? edgeId : last.current.edgeId;
  const node = shownNode ? NODE_BY_ID[shownNode] : null;
  const edge = shownEdge ? EDGE_BY_ID[shownEdge] : null;

  return (
    <aside className={`insp insp--${side}${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="Component details" data-testid="inspector">
      <div className="insp__scroll" ref={ref}>
        {node && <NodeDetails node={node} opts={opts} silent={silent} onClose={onClose} onSilence={onSilence} onPing={onPing} />}
        {edge && !node && (
          <div className="insp__inner">
            <div className="insp__top">
              <span className={`medium-tag m-${edge.medium}`}>{MEDIUM_LABEL[edge.medium]}</span>
              <button className="icon-btn" onClick={onClose} aria-label="Close details" data-testid="inspector-close">
                <X size={18} />
              </button>
            </div>
            <h3 className="insp__title">{edge.label}</h3>
            <p className="insp__role">{edge.detail}</p>
            <div className="insp__ends">
              {[edge.from, edge.to].map((id, i) => (
                <button key={id} className="end-btn" onClick={() => onSelectNode(id)} data-testid={`edge-end-${i}`}>
                  {i === 1 && <ArrowRightLeft size={14} aria-hidden="true" />}
                  {nameOf(id)}
                </button>
              ))}
            </div>
            <section className="insp__sec">
              <h4>Sources</h4>
              <SourceLinks keys={edge.sources} compact />
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}

function NodeDetails({
  node,
  opts,
  silent,
  onClose,
  onSilence,
  onPing,
}: {
  node: NetNode;
  opts: Opts;
  silent: string | null;
  onClose: () => void;
  onSilence: (id: string | null) => void;
  onPing: (id: string, msg: number | null) => void;
}) {
  const sends = MESSAGES.filter((m) => m.sender === node.id && m.basis !== 'diagnostic' && (!m.requires || m.requires.every((o) => opts[o])));
  const onV = node.can?.some((c) => c.bus === 'V bus');
  const canSilence = onV && node.kind !== 'junction' && node.kind !== 'port';
  const isSilent = silent === node.id;
  const report = silenceReport(node.id, opts);
  const firstMsg = sends.find((m) => m.signals) ?? sends[0];

  return (
    <div className="insp__inner">
      <div className="insp__top">
        <span className={`domain-tag d-${node.domain}`}>
          <span className="domain-tag__dot" aria-hidden="true" />
          {DOMAIN_LABEL[node.domain]}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close details" data-testid="inspector-close">
          <X size={18} />
        </button>
      </div>
      <h3 className="insp__title">{node.name}</h3>
      <p className="insp__loc">
        <MapPin size={15} aria-hidden="true" />
        {node.location}
      </p>
      <p className="insp__role">{node.role}</p>

      {(onV || node.can?.length) && (
        <div className="insp__actions">
          {node.can && node.can.length > 0 && (
            <button className="btn btn--accent" onClick={() => onPing(node.id, firstMsg?.id ?? null)} data-testid="inspector-ping">
              <Radio size={16} aria-hidden="true" />
              Broadcast {firstMsg ? hex(firstMsg.id) : 'a frame'}
            </button>
          )}
          {canSilence && (
            <button
              className={`btn${isSilent ? ' btn--danger' : ''}`}
              onClick={() => onSilence(isSilent ? null : node.id)}
              aria-pressed={isSilent}
              data-testid="inspector-silence"
            >
              {isSilent ? <PlugZap size={16} aria-hidden="true" /> : <Unplug size={16} aria-hidden="true" />}
              {isSilent ? 'Plug back in' : 'Unplug from the bus'}
            </button>
          )}
        </div>
      )}

      {isSilent && (
        <section className="insp__sec insp__sec--alert" data-testid="silence-report">
          <h4>With {nameOf(node.id)} unplugged</h4>
          {report.others.length > 0 ? (
            <ul className="dtc-list">
              {report.others.map((d) => (
                <li key={d.code}>
                  <code>{d.code}</code>
                  <span>
                    {d.meaning}. Stored by {d.storedBy.map(nameOf).join(', ') || '—'}.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="insp__hint">No other ECU stores a communication DTC for this module.</p>
          )}
          {report.self.length > 0 && (
            <p className="insp__hint">
              Powered but cut off, it logs <b>{report.self.join(', ')}</b> about everyone it can no longer hear.
            </p>
          )}
          {report.effects.length > 0 && (
            <>
              <h5>What the driver notices</h5>
              <ul className="effects">
                {report.effects.map((r) => (
                  <li key={r.fn}>
                    <b>{r.fn}</b> ({r.master.map(nameOf).join(' / ')}): {r.failsafe}
                    {r.driver !== '—' && <span className="effects__drv"> {r.driver}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {node.facts && node.facts.length > 0 && (
        <section className="insp__sec">
          <h4>Worth knowing</h4>
          <ul className="facts">
            {node.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {node.can && node.can.length > 0 && (
        <section className="insp__sec">
          <h4>On the bus</h4>
          <table className="pins">
            <thead>
              <tr>
                <th scope="col">Bus</th>
                <th scope="col">CANH</th>
                <th scope="col">CANL</th>
              </tr>
            </thead>
            <tbody>
              {node.can.filter((c) => c.bus === 'V bus' || opts.eco).map((c) => (
                <tr key={c.connector + c.bus}>
                  <td>
                    {c.bus}
                    <span className="pins__jc">{c.jc}</span>
                  </td>
                  <td>
                    <code>
                      {c.connector}-{c.canh}
                    </code>
                    <span className={`wirec wc-${c.colorH}`}>{wire(c.colorH)}</span>
                  </td>
                  <td>
                    <code>
                      {c.connector}-{c.canl}
                    </code>
                    <span className={`wirec wc-${c.colorL}`}>{wire(c.colorL)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {node.terminator && <p className="insp__hint">Contains one of the two 120 Ω terminating resistors at the ends of the main line.</p>}
        </section>
      )}

      {node.gateway && (
        <section className="insp__sec">
          <h4>Gateway to</h4>
          <p>{node.gateway}</p>
        </section>
      )}

      <CloseUp node={node} opts={opts} />

      {(sends.length > 0 || node.publishes || node.consumes) && (
        <section className="insp__sec">
          <h4>What it shares</h4>
          {node.publishes && (
            <ul className="facts facts--out">
              {node.publishes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {sends.length > 0 && (
            <div className="idchips" aria-label="CAN IDs it transmits">
              {sends.map((m) => (
                <span key={m.id} className={`idchip basis-${m.basis}`} title={m.summary}>
                  {hex(m.id)}
                  {m.toyota && <small>{m.toyota}</small>}
                </span>
              ))}
            </div>
          )}
          {node.consumes && node.consumes.length > 0 && (
            <>
              <h5>What it listens for</h5>
              <ul className="facts facts--in">
                {node.consumes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!isSilent && (report.others.length > 0 || node.silentDtc) && (
        <section className="insp__sec">
          <h4>If it goes silent</h4>
          <ul className="dtc-list">
            {(node.silentDtc ?? []).map((d) => (
              <li key={d.code}>
                <code>{d.code}</code>
                <span>
                  {d.meaning} — stored by {d.storedBy.join(', ')}.
                </span>
              </li>
            ))}
          </ul>
          {canSilence && (
            <p className="insp__hint">
              Use <b>Unplug from the bus</b> to see the codes and fail-safe behavior on the map.
            </p>
          )}
        </section>
      )}

      <section className="insp__sec">
        <h4>Sources</h4>
        <SourceLinks keys={node.sources} compact />
      </section>
      {node.requires && (
        <p className="insp__hint">
          <Pill tone="info">Option</Pill> Present only with the equipment noted in the preset.
        </p>
      )}
    </div>
  );
}
