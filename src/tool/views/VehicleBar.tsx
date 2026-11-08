import { Lock, LockOpen, Plus, Radio, X } from 'lucide-react';
import { useState } from 'react';
import { STATUS_LABEL, VEHICLES, VEHICLE_BY_ID, vehicleTitle, miles, YOU } from '../data/fleet';
import { sim } from '../sim/engine';
import { useSim } from '../sim/hooks';
import { useActions } from '../actions';
import { Badge, Seg } from '../ui/common';
import { SignalBars } from '../ui/charts';
import { CarGlyph } from '../ui/CarGlyph';

export function VehicleBar({
  tabs,
  vid,
  onPick,
  onClose,
}: {
  tabs: string[];
  vid: string;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
}) {
  useSim(2);
  const { control, toast } = useActions();
  const [menu, setMenu] = useState(false);
  const rt = sim.byId[vid];
  const v = rt.v;
  const others = VEHICLES.filter((x) => !tabs.includes(x.id));
  const active = rt.dtcs.filter((d) => d.status !== 'history').length;
  return (
    <div className="st-vbar">
      <div className="st-tabs" role="tablist" aria-label="Open vehicles">
        {tabs.map((id) => {
          const t = VEHICLE_BY_ID[id];
          const r = sim.byId[id];
          const n = r.dtcs.filter((d) => d.status !== 'history').length;
          return (
            <div key={id} className={`st-tab${id === vid ? ' is-on' : ''}`}>
              <button role="tab" aria-selected={id === vid} onClick={() => onPick(id)} data-testid={`tab-${id}`}>
                <i className="st-swatch" style={{ background: t.swatch }} aria-hidden="true" />
                <b>{t.slot}</b>
                <span>
                  {t.year} {t.trim.split(' · ')[0]}
                </span>
                {n > 0 && <em>{n}</em>}
              </button>
              <button className="st-tab__x" onClick={() => onClose(id)} aria-label={`Close ${t.slot}`} data-testid={`tab-close-${id}`}>
                <X size={14} />
              </button>
            </div>
          );
        })}
        {others.length > 0 && (
          <div className="st-tab-add">
            <button
              className="st-tab__plus"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-label="Open another vehicle"
              data-testid="tab-add"
            >
              <Plus size={16} />
            </button>
            {menu && (
              <ul className="st-menu" role="menu">
                {others.map((o) => (
                  <li key={o.id}>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        onPick(o.id);
                      }}
                      data-testid={`tab-open-${o.id}`}
                    >
                      <i className="st-swatch" style={{ background: o.swatch }} aria-hidden="true" />
                      <b>{o.slot}</b> {vehicleTitle(o)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="st-vhead" data-testid="vehicle-head">
        <div className="st-vhead__id">
          <CarGlyph color={v.swatch} size={104} moving={rt.id === 'road' && sim.read(rt, 'vss') > 1} />
          <div>
            <p className="st-vhead__slot">
              {v.slot} ·{' '}
              <Badge tone={v.status === 'ready' ? 'ok' : v.status === 'road' ? 'info' : 'warn'} dot>
                {STATUS_LABEL[v.status]}
              </Badge>
            </p>
            <h1 className="st-vhead__title">{vehicleTitle(v)}</h1>
            <p className="st-vhead__meta">
              <span>{v.trim}</span>
              <span>{v.engine}</span>
              <span>{v.color}</span>
              <span className="mono">VIN …{v.vin8}</span>
              <span className="mono">{miles(Math.round(rt.s.odo))}</span>
              <span>
                RO {v.ro} · {v.customer}
              </span>
            </p>
          </div>
        </div>
        <p className="st-vhead__concern">
          <b>Concern</b> {v.concern}
        </p>
        <div className="st-vhead__link">
          <div className="st-adapter" title="Adapter link">
            <Radio size={16} aria-hidden="true" />
            <div>
              <b className="mono">{v.adapter.id}</b>
              <span className="mono">
                {Math.round(rt.link.rssi)} dBm · {Math.round(rt.link.lat)} ms · {Math.round(rt.link.fps)} frames/s · bus{' '}
                {Math.round(rt.link.load * 100)} %
              </span>
            </div>
            <SignalBars rssi={rt.link.rssi} />
          </div>
          <div className="st-session">
            <Seg
              small
              value={rt.mode}
              onChange={(m) => sim.setMode(vid, m)}
              label="Adapter mode"
              testId="mode"
              options={[
                { value: 'listen', label: 'Listen-only', title: 'Adapter never transmits; broadcast frames only' },
                { value: 'read', label: 'Read session', title: 'Adapter may send diagnostic read requests' },
              ]}
            />
            {rt.holder === YOU ? (
              <button
                className="st-ctl is-you"
                onClick={() => sim.releaseControl(vid)}
                data-testid="control-release"
                title="You hold exclusive control: active tests, clearing codes and utilities"
              >
                <LockOpen size={15} aria-hidden="true" /> You have control
              </button>
            ) : (
              <button
                className="st-ctl"
                onClick={() => control(vid, 'Taking control', () => toast(`You now control ${v.slot}`))}
                disabled={rt.handoff !== null}
                data-testid="control-request"
                title="Request exclusive control"
              >
                <Lock size={15} aria-hidden="true" /> {rt.handoff !== null ? `Waiting for ${rt.holder}…` : `Control: ${rt.holder}`}
              </button>
            )}
            {active > 0 && (
              <Badge tone="warn">
                {active} active code{active === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
