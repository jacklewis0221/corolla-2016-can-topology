import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Droplets, ExternalLink, Eye, MessageSquareText, Search, Wrench, X } from 'lucide-react';
import { money, miles as mi, vehicleTitle, type Health, type InspectionItem } from '../data/fleet';
import { dueInterval, forecastDate, serviceAt, upcoming, type ServiceItem } from '../data/maintenance';
import { SOURCES } from '../../data/sources';
import { sim } from '../sim/engine';
import { useActions } from '../actions';
import { Badge, Dialog, Panel, Seg } from '../ui/common';

type Decision = 'yes' | 'no';
interface Sheet {
  status: Record<string, Health>;
  decision: Record<string, Decision>;
}

// Session-only memory so the sheet survives switching views (never written to browser storage).
const SHEETS: Record<string, Sheet> = {};

const TONE: Record<Health, 'ok' | 'warn' | 'danger'> = { ok: 'ok', soon: 'warn', now: 'danger' };
const WORD: Record<Health, string> = { ok: 'Good', soon: 'Soon', now: 'Now' };
const GROUP_ORDER: InspectionItem['group'][] = ['Tires', 'Brakes', 'Battery', 'Fluids', 'Filters', 'Wipers & lights', 'Under vehicle'];

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

interface Rec {
  id: string;
  label: string;
  why: string;
  price: number;
  level: Health;
  from: 'inspection' | 'schedule';
}

export function Maint({ vid }: { vid: string }) {
  const { toast } = useActions();
  const rt = sim.byId[vid];
  const v = rt.v;
  const [mode, setMode] = useState<'tech' | 'customer'>('tech');
  const [sheet, setSheetState] = useState<Sheet>(
    () => SHEETS[vid] ?? { status: Object.fromEntries(v.inspection.map((i) => [i.id, i.status])), decision: {} },
  );
  const setSheet = (fn: (s: Sheet) => Sheet) =>
    setSheetState((s) => {
      const n = fn(s);
      SHEETS[vid] = n;
      return n;
    });
  const [preview, setPreview] = useState(false);
  const [q, setQ] = useState('');

  const valvematic = v.engine === '2ZR-FAE';
  const due = dueInterval(v.miles);
  const svc = serviceAt(due, valvematic);
  const next = upcoming(v.miles, 5).slice(1);
  const today = new Date();

  const recs: Rec[] = useMemo(() => {
    const out: Rec[] = [];
    const seen = new Set<string>();
    for (const i of v.inspection) {
      const lvl = sheet.status[i.id] ?? i.status;
      if (lvl === 'ok' || !i.price) continue;
      out.push({ id: i.id, label: i.job ?? i.label, why: i.note ?? i.value, price: i.price, level: lvl, from: 'inspection' });
      seen.add(i.id);
    }
    for (const s of svc.items) {
      if (!s.price || seen.has(s.id)) continue;
      out.push({ id: s.id, label: s.label, why: s.why, price: s.price, level: 'soon', from: 'schedule' });
    }
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'now' ? -1 : 1));
  }, [v.inspection, sheet.status, svc.items]);

  const counts = { now: 0, soon: 0, ok: 0 } as Record<Health, number>;
  for (const i of v.inspection) counts[sheet.status[i.id] ?? i.status]++;
  const approved = recs.filter((r) => sheet.decision[r.id] === 'yes');
  const declined = recs.filter((r) => sheet.decision[r.id] === 'no');
  const approvedTotal = approved.reduce((s, r) => s + r.price, 0);
  const openTotal = recs.filter((r) => !sheet.decision[r.id]).reduce((s, r) => s + r.price, 0);

  const decide = (id: string, d: Decision) =>
    setSheet((s) => {
      const decision = { ...s.decision };
      if (decision[id] === d) delete decision[id];
      else decision[id] = d;
      return { ...s, decision };
    });

  const summary = [
    `Hi ${v.customer}, this is ${v.advisor} at the service desk.`,
    `Your ${vehicleTitle(v)} (RO ${v.ro}, ${mi(v.miles)}) has finished its inspection.`,
    '',
    ...(recs.filter((r) => r.level === 'now').length
      ? ['Needs attention now:', ...recs.filter((r) => r.level === 'now').map((r) => `• ${r.label} — ${money(r.price)}`), '']
      : []),
    ...(recs.filter((r) => r.level === 'soon').length
      ? ['Recommended:', ...recs.filter((r) => r.level === 'soon').map((r) => `• ${r.label} — ${money(r.price)}`), '']
      : []),
    `Everything else checked out (${counts.ok} items in good shape).`,
    approved.length ? `Approved so far: ${money(approvedTotal)}.` : 'Reply with the items you’d like us to do and we’ll get started.',
    `Estimated ready time: ${v.promised}.`,
  ].join('\n');

  const filt = q.trim().toLowerCase();
  const items = v.inspection.filter((i) => !filt || `${i.label} ${i.group} ${i.value}`.toLowerCase().includes(filt));

  return (
    <div className="st-maint">
      <header className="st-viewhead">
        <div>
          <h2>Maintenance & advisor</h2>
          <p className="st-lede">
            Toyota’s schedule for this car’s mileage, the multipoint inspection, and a customer-facing view the advisor can walk through at
            the counter.
          </p>
        </div>
        <div className="st-viewhead__actions">
          <Seg
            value={mode}
            onChange={setMode}
            label="Audience"
            testId="maint-mode"
            options={[
              { value: 'tech', label: 'Technician' },
              { value: 'customer', label: 'Customer view' },
            ]}
          />
        </div>
      </header>

      {mode === 'tech' ? (
        <>
          <div className="st-maint__grid">
            <Panel
              title={`${due.toLocaleString('en-US')}-mile service`}
              sub={`Due now at ${mi(v.miles)} · normal operating conditions · ${valvematic ? '2ZR-FAE (LE Eco)' : '2ZR-FE'}`}
              id="svc-title"
              actions={<Badge tone="accent">{svc.months} months</Badge>}
            >
              {svc.repeated && (
                <div className="st-callout st-callout--info">
                  <span>
                    Toyota’s printed log ends at 120,000 miles. Past that, the console repeats the same pattern — an assumption, not a
                    Toyota statement.
                  </span>
                </div>
              )}
              <ul className="st-svc" data-testid="svc-items">
                {svc.items.map((s) => (
                  <SvcRow key={s.id} s={s} />
                ))}
              </ul>
              {svc.inspections.length > 0 && (
                <>
                  <h4 className="st-subhead">Also inspect</h4>
                  <ul className="st-chips">
                    {svc.inspections.map((i) => (
                      <li key={i} className="st-chip">
                        {i}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {svc.notes.map((n) => (
                <p key={n} className="st-foot">
                  {n}
                </p>
              ))}
              <p className="st-foot">
                Schedule:{' '}
                <a href={SOURCES.maintGuide.url} target="_blank" rel="noopener noreferrer" data-testid="maint-src-guide">
                  2016 Corolla Warranty & Maintenance Guide <ExternalLink size={12} aria-hidden="true" />
                </a>{' '}
                · prices are sample shop rates.
              </p>
            </Panel>
            <div className="st-maint__side">
              <Panel title="Coming up" sub="Forecast from this car’s average miles per month" id="next-title">
                <ol className="st-upcoming">
                  {next.map((at) => {
                    const s = serviceAt(at, valvematic);
                    const big = s.items.filter((i) => !['mat', 'fluids', 'wipers', 'brakesVis'].includes(i.id));
                    return (
                      <li key={at}>
                        <span className="st-upcoming__mi mono">{(at / 1000).toFixed(0)}k</span>
                        <div>
                          <b>{fmtDate(forecastDate(v, at, today))}</b>
                          <span>{big.map((i) => i.label.replace(/ \(.*\)$/, '')).join(' · ') || 'Inspection only'}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Panel>
              <Panel title="Quick specs" sub="2016 Corolla owner’s manual" id="spec-title">
                <dl className="st-specs">
                  <div>
                    <dt>
                      <Droplets size={14} aria-hidden="true" /> Engine oil
                    </dt>
                    <dd>0W-20 · 4.4 qt with filter</dd>
                  </div>
                  <div>
                    <dt>Tires (P205/55R16)</dt>
                    <dd>32 psi (220 kPa) front and rear, cold</dd>
                  </div>
                  <div>
                    <dt>Compact spare</dt>
                    <dd>60 psi (420 kPa)</dd>
                  </div>
                  <div>
                    <dt>Wheel nuts</dt>
                    <dd>76 ft·lbf (103 N·m)</dd>
                  </div>
                </dl>
                <p className="st-foot">
                  <a href={SOURCES.ownersManual.url} target="_blank" rel="noopener noreferrer" data-testid="maint-src-om">
                    2016 Corolla Owner’s Manual (PDF) <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </p>
              </Panel>
            </div>
          </div>
          <Panel
            title="Multipoint inspection"
            sub="Set each item’s condition; the customer view updates instantly."
            id="mpi-title"
            actions={
              <label className="st-filter st-filter--inline">
                <Search size={15} aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter items"
                  aria-label="Filter inspection items"
                  data-testid="mpi-filter"
                />
              </label>
            }
          >
            <div className="st-mpi">
              {GROUP_ORDER.map((g) => {
                const rows = items.filter((i) => i.group === g);
                if (!rows.length) return null;
                return (
                  <div key={g} className="st-mpi__group">
                    <h4 className="st-subhead">{g}</h4>
                    <ul>
                      {rows.map((i) => {
                        const st = sheet.status[i.id] ?? i.status;
                        return (
                          <li key={i.id} className={`st-mpi__row is-${st}`}>
                            <div>
                              <b>{i.label}</b>
                              <span className="mono">{i.value}</span>
                              {i.note && <small>{i.note}</small>}
                            </div>
                            <Seg
                              small
                              value={st}
                              onChange={(val) => setSheet((s) => ({ ...s, status: { ...s.status, [i.id]: val } }))}
                              label={`${i.label} condition`}
                              testId={`mpi-${i.id}`}
                              options={[
                                { value: 'ok', label: 'Good' },
                                { value: 'soon', label: 'Soon' },
                                { value: 'now', label: 'Now' },
                              ]}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      ) : (
        <div className="st-cust">
          <section className="st-cust__hero" aria-labelledby="cust-title">
            <div>
              <p className="st-kicker">Inspection results · RO {v.ro}</p>
              <h3 id="cust-title">
                {v.customer}’s {vehicleTitle(v)}
              </h3>
              <p className="muted">
                {mi(v.miles)} · {v.color} · advisor {v.advisor}
              </p>
            </div>
            <div className="st-cust__counts">
              <div className="is-now">
                <b>{counts.now}</b>
                <span>Needs attention</span>
              </div>
              <div className="is-soon">
                <b>{counts.soon}</b>
                <span>Plan for soon</span>
              </div>
              <div className="is-ok">
                <b>{counts.ok}</b>
                <span>Looks good</span>
              </div>
            </div>
          </section>
          <div className="st-cust__grid">
            <Panel
              title="Recommended today"
              sub="Approve or decline each item with the customer. Prices are sample shop rates."
              id="rec-title"
              actions={
                <button
                  className="st-btn st-btn--sm"
                  onClick={() =>
                    setSheet((s) => ({
                      ...s,
                      decision: { ...s.decision, ...Object.fromEntries(recs.filter((r) => r.level === 'now').map((r) => [r.id, 'yes'])) },
                    }))
                  }
                  data-testid="approve-urgent"
                >
                  <Check size={14} aria-hidden="true" /> Approve urgent items
                </button>
              }
            >
              {recs.length ? (
                <ul className="st-recs" data-testid="recs">
                  {recs.map((r) => {
                    const d = sheet.decision[r.id];
                    return (
                      <li key={r.id} className={`st-rec is-${r.level}${d ? ` is-${d}` : ''}`}>
                        <i className="st-rec__dot" aria-hidden="true" />
                        <div className="st-rec__body">
                          <b>{r.label}</b>
                          <span>{r.why}</span>
                          <small>
                            {r.from === 'schedule'
                              ? `Toyota schedule · ${due.toLocaleString('en-US')} mi`
                              : `Inspection · ${WORD[r.level]}`}
                          </small>
                        </div>
                        <span className="st-rec__price mono">{money(r.price)}</span>
                        <div className="st-rec__btns">
                          <button
                            className={`st-btn st-btn--sm${d === 'yes' ? ' st-btn--ok' : ''}`}
                            aria-pressed={d === 'yes'}
                            onClick={() => decide(r.id, 'yes')}
                            data-testid={`rec-yes-${r.id}`}
                          >
                            <Check size={14} aria-hidden="true" /> Approve
                          </button>
                          <button
                            className={`st-btn st-btn--sm${d === 'no' ? ' st-btn--danger' : ''}`}
                            aria-pressed={d === 'no'}
                            onClick={() => decide(r.id, 'no')}
                            data-testid={`rec-no-${r.id}`}
                          >
                            <X size={14} aria-hidden="true" /> Decline
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="st-foot">Nothing to recommend — every inspection item is in good shape.</p>
              )}
            </Panel>
            <div className="st-cust__side">
              <Panel title="Estimate" id="est-title">
                <dl className="st-total">
                  <div>
                    <dt>Approved</dt>
                    <dd className="mono">{money(approvedTotal)}</dd>
                  </div>
                  <div>
                    <dt>Still to decide</dt>
                    <dd className="mono">{money(openTotal)}</dd>
                  </div>
                  <div>
                    <dt>Declined</dt>
                    <dd className="mono">
                      {declined.length} item{declined.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                </dl>
                <button className="st-btn st-btn--primary st-btn--block" onClick={() => setPreview(true)} data-testid="preview-summary">
                  <MessageSquareText size={16} aria-hidden="true" /> Preview text summary
                </button>
                <p className="st-foot">Preview only — this concept never sends messages.</p>
              </Panel>
              <Panel title="Condition at a glance" id="glance-title">
                <ul className="st-glance">
                  {GROUP_ORDER.map((g) => {
                    const rows = v.inspection.filter((i) => i.group === g);
                    if (!rows.length) return null;
                    const worst = rows.reduce<Health>((w, i) => {
                      const s = sheet.status[i.id] ?? i.status;
                      return s === 'now' || (s === 'soon' && w === 'ok') ? s : w;
                    }, 'ok');
                    return (
                      <li key={g}>
                        <span>{g}</span>
                        <Badge tone={TONE[worst]} dot>
                          {WORD[worst]}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          </div>
        </div>
      )}
      <Dialog
        open={preview}
        title="Text summary preview"
        onClose={() => setPreview(false)}
        testId="summary"
        footer={
          <>
            <button
              className="st-btn"
              onClick={() => {
                navigator.clipboard?.writeText(summary).then(
                  () => toast('Summary copied to the clipboard'),
                  () => toast('Copy is not available in this browser'),
                );
              }}
              data-testid="summary-copy"
            >
              Copy text
            </button>
            <button className="st-btn st-btn--primary" onClick={() => setPreview(false)} data-testid="summary-done" data-autofocus>
              Done
            </button>
          </>
        }
      >
        <p className="muted">
          Preview only. In a real shop this would go through the dealership’s customer messaging system after the customer opted in.
        </p>
        <pre className="st-sms" data-testid="summary-text">
          {summary}
        </pre>
      </Dialog>
    </div>
  );
}

function SvcRow({ s }: { s: ServiceItem }) {
  const Icon = s.kind === 'replace' ? Wrench : s.kind === 'inspect' ? Eye : ClipboardCheck;
  return (
    <li className={`st-svc__row is-${s.kind}`}>
      <span className="st-svc__icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <div>
        <b>{s.label}</b>
        <span>{s.why}</span>
      </div>
      {s.price ? <span className="st-svc__price mono">{money(s.price)}</span> : <span className="st-svc__price muted">incl.</span>}
    </li>
  );
}
