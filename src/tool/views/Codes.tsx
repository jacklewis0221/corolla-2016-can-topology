import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Eraser,
  Lightbulb,
  Lock,
  RotateCcw,
  ScanLine,
  Wrench,
  XCircle,
} from 'lucide-react';
import { DTC_DEFS, PROCEDURES, type ProcStep, type Procedure } from '../data/procedures';
import { NODE_BY_ID } from '../../data/nodes';
import { SOURCES } from '../../data/sources';
import { YOU } from '../data/fleet';
import { sim, type Rt, type StepResult } from '../sim/engine';
import { useSim } from '../sim/hooks';
import { insights } from '../sim/insights';
import { useActions } from '../actions';
import { Badge, Empty, Panel } from '../ui/common';
import { ActiveTests, CrankChart } from '../ui/Tests';
import { BusDiagram } from '../ui/BusDiagram';

const short = (id: string) => NODE_BY_ID[id]?.short ?? (id === 'tpms' ? 'TPMS ECU' : id);
const defKey = (code: string) => code.replace(/\/.*/, '');

export function Codes({ vid }: { vid: string }) {
  useSim(4);
  const { focusCode, setFocusCode, control, confirm, read } = useActions();
  const rt = sim.byId[vid];
  const groups = groupCodes(rt);
  const concern = rt.v.scenario === 'battery' ? 'C1241' : null;
  const stored = groups.map((g) => g.code);
  const keyStr = stored.join(',');
  // Codes stay listed after they are cleared, so the procedure can be finished and confirmed.
  const [seen, setSeen] = useState<string[]>(stored);
  useEffect(() => {
    setSeen((cur) => [...new Set([...cur, ...(keyStr ? keyStr.split(',') : [])])]);
  }, [keyStr]);
  const listed = [...new Set([...seen, ...stored])];
  const keys = [...listed, ...(concern ? [concern] : [])];
  const [sel, setSel] = useState<string | null>(() => (focusCode && keys.includes(focusCode) ? focusCode : (keys[0] ?? null)));
  useEffect(() => {
    if (focusCode) setFocusCode(null);
  }, [focusCode, setFocusCode]);
  const current = sel && keys.includes(sel) ? sel : (keys[0] ?? null);
  const def = current ? DTC_DEFS[defKey(current)] : null;
  const active = rt.dtcs.filter((d) => d.status !== 'history');

  const clear = () =>
    control(vid, 'Clearing codes', () =>
      confirm({
        title: 'Clear trouble codes?',
        body: (
          <>
            <p>
              This erases the {rt.dtcs.length} stored code{rt.dtcs.length === 1 ? '' : 's'} and their freeze-frame data in every ECU on{' '}
              {rt.v.slot}. If the fault is still there, the code will come back.
            </p>
            <p className="muted">Simulated — nothing is sent to a real car.</p>
          </>
        ),
        confirm: 'Clear codes',
        tone: 'danger',
        onConfirm: () => sim.clearCodes(vid),
      }),
    );

  return (
    <div className="st-codes">
      <header className="st-viewhead">
        <div>
          <h2>Codes & guided fixes</h2>
          <p className="st-lede">Stored codes, what the console thinks is most likely, and the repair-manual procedure step by step.</p>
        </div>
        <div className="st-viewhead__actions">
          <button className="st-btn" onClick={() => read(vid, 'Reading codes', () => sim.scan(vid))} data-testid="codes-read">
            <ScanLine size={16} aria-hidden="true" /> Read codes
          </button>
          <button className="st-btn st-btn--danger" onClick={clear} disabled={!rt.dtcs.length} data-testid="codes-clear">
            <Eraser size={16} aria-hidden="true" /> Clear codes
            {rt.holder !== YOU && <Lock size={14} aria-label="Needs control" />}
          </button>
        </div>
      </header>
      <div className="st-codes__grid">
        <Panel
          className="st-codelist"
          title="Stored codes"
          sub={`${active.length} active · ${rt.dtcs.length - active.length} history`}
          id="codelist-title"
        >
          {keys.length === 0 && (
            <Empty icon={<CheckCircle2 size={28} />} title="No trouble codes">
              Every module answered without stored codes.
            </Empty>
          )}
          <ul className="st-codeitems">
            {listed.map((code) => {
              const g = groups.find((x) => x.code === code);
              const d = DTC_DEFS[defKey(code)];
              const status = g?.status ?? 'cleared';
              return (
                <li key={code}>
                  <button
                    className={`st-codeitem${current === code ? ' is-on' : ''}${g ? '' : ' is-cleared'}`}
                    onClick={() => setSel(code)}
                    data-testid={`code-${code}`}
                  >
                    <span className="st-codeitem__code mono">{d?.code ?? code}</span>
                    <span className="st-codeitem__title">{d?.title ?? 'Trouble code'}</span>
                    <span className="st-codeitem__meta">
                      {g ? (g.ecus.length > 1 ? `Stored by ${g.ecus.length} ECUs` : short(g.ecus[0])) : 'Cleared this session'}
                      <Badge tone={status === 'history' || status === 'cleared' ? 'neutral' : status === 'pending' ? 'accent' : 'warn'}>
                        {status}
                      </Badge>
                    </span>
                  </button>
                </li>
              );
            })}
            {concern && (
              <li>
                <button
                  className={`st-codeitem st-codeitem--concern${current === concern ? ' is-on' : ''}`}
                  onClick={() => setSel(concern)}
                  data-testid="code-concern"
                >
                  <span className="st-codeitem__code">Concern</span>
                  <span className="st-codeitem__title">Slow crank; ABS and slip lights came on briefly</span>
                  <span className="st-codeitem__meta">
                    No stored code · related: C1241
                    <Badge tone="info">symptom</Badge>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </Panel>
        <div className="st-codes__main">
          {def ? (
            <DtcDetail rt={rt} code={current!} />
          ) : (
            <Panel title="Nothing to diagnose">This vehicle has no stored codes or open concerns.</Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function groupCodes(rt: Rt) {
  const map = new Map<string, { code: string; ecus: string[]; status: string; freeze?: [string, string][]; miles: number }>();
  for (const d of rt.dtcs) {
    const g = map.get(d.code);
    if (g) {
      g.ecus.push(d.ecu);
      if (d.status !== 'history') g.status = d.status;
    } else map.set(d.code, { code: d.code, ecus: [d.ecu], status: d.status, freeze: d.freeze, miles: d.miles });
  }
  return [...map.values()];
}

function DtcDetail({ rt, code }: { rt: Rt; code: string }) {
  const def = DTC_DEFS[defKey(code)];
  const g = groupCodes(rt).find((x) => x.code === code);
  const ins = insights(rt);
  const proc = def.proc ? PROCEDURES[def.proc] : null;
  return (
    <>
      <section className="st-dtchead" aria-labelledby="dtc-title">
        <div className="st-dtchead__code mono">{def.code}</div>
        <div>
          <h3 id="dtc-title">{def.title}</h3>
          <p className="st-dtchead__meta">
            <span>{def.system}</span>
            <span>MIL: {def.mil}</span>
            {g && <span>First stored at {g.miles.toLocaleString('en-US')} mi</span>}
          </p>
          {g && (
            <div className="st-chips">
              {g.ecus.map((e) => (
                <span key={e} className="st-chip">
                  Stored by {short(e)}
                </span>
              ))}
              <Badge tone={g.status === 'history' ? 'neutral' : 'warn'} dot>
                {g.status}
              </Badge>
            </div>
          )}
          {!g && (
            <p className="st-dtchead__meta">
              Not stored right now — {code === 'C1241' ? 'this code clears itself when supply voltage recovers.' : 'cleared.'}
            </p>
          )}
        </div>
      </section>
      <div className="st-dtcgrid">
        <Panel title="Detection condition" id="det-title">
          <p className="st-prose">{def.detect}</p>
          {def.notes?.map((n) => (
            <p key={n} className="st-prose muted">
              {n}
            </p>
          ))}
        </Panel>
        <Panel title="Trouble areas" sub="From the repair manual" id="areas-title">
          <ul className="st-areas">
            {def.areas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Panel>
        {g?.freeze && (
          <Panel title="Freeze frame" sub="Conditions when the code set" id="ff-title">
            <dl className="st-ff">
              {g.freeze.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className="mono">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}
      </div>
      {ins && (
        <Panel
          className="st-suggest"
          title={
            <>
              <Lightbulb size={18} aria-hidden="true" /> Suggested fix
            </>
          }
          sub="Ranked by the console from live data, vehicle history and the manual’s trouble areas. The procedure below decides."
          id="sugg-title"
          actions={<Badge tone="accent">Console inference</Badge>}
        >
          <p className={`st-suggest__headline${ins.resolved ? ' is-ok' : ''}`}>{ins.headline}</p>
          {ins.causes.length > 0 && (
            <ol className="st-causes">
              {ins.causes.map((c, i) => (
                <li key={c.label} className={i === 0 ? 'is-top' : ''}>
                  <div className="st-causes__head">
                    <span className="st-causes__rank">{i + 1}</span>
                    <b>{c.label}</b>
                    <span className="st-causes__bar" aria-label={`Likelihood ${Math.round(c.score * 100)} %`}>
                      <span style={{ width: `${c.score * 100}%` }} />
                    </span>
                    <span className="mono st-causes__pct">{Math.round(c.score * 100)}%</span>
                  </div>
                  <ul>
                    {c.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <p className="st-causes__action">
                    <ChevronRight size={14} aria-hidden="true" /> {c.action}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {rt.v.scenario === 'lean' && !ins.resolved && (
            <div className="st-support">
              <p className="st-support__title">Supporting checks</p>
              <ActiveTests vid={rt.id} compact />
            </div>
          )}
        </Panel>
      )}
      {proc && <ProcedurePanel rt={rt} proc={proc} />}
    </>
  );
}

function pathOf(rt: Rt, proc: Procedure): { step: ProcStep; res?: StepResult }[] {
  const out: { step: ProcStep; res?: StepResult }[] = [];
  const byKey = Object.fromEntries(proc.steps.map((s) => [s.key, s]));
  let key: string | undefined = proc.start;
  const seen = new Set<string>();
  while (key && byKey[key] && !seen.has(key)) {
    seen.add(key);
    const step: ProcStep = byKey[key];
    const res = rt.steps[`${proc.id}.${step.key}`];
    out.push({ step, res });
    if (!res) break;
    key = res.result === 'ok' ? (step.ok ?? step.next) : res.result === 'ng' ? (step.ng ?? step.next) : step.next;
    if (!key && !step.end) break;
  }
  return out;
}

function ProcedurePanel({ rt, proc }: { rt: Rt; proc: Procedure }) {
  const { control, confirm, toast } = useActions();
  const [hint, setHint] = useState<string | null>(null);
  const pending = useRef<ProcStep | null>(null);
  const path = pathOf(rt, proc);
  const last = path[path.length - 1];
  const finished =
    !!last?.res &&
    (last.step.end ||
      !(last.res.result === 'ok'
        ? (last.step.ok ?? last.step.next)
        : last.res.result === 'ng'
          ? (last.step.ng ?? last.step.next)
          : last.step.next));
  const run = (step: ProcStep, manual?: 'ok' | 'ng') => {
    const go = () => {
      const r = sim.runStep(rt.id, proc.id, step, manual);
      setHint(r.result === 'wait' ? r.reading : null);
      // A CAN bus check takes a few seconds; finish the step on its own once the scan is done.
      pending.current = r.result === 'wait' && step.hook === 'canCheck' ? step : null;
    };
    if (step.needsControl) control(rt.id, 'This step', go);
    else go();
  };
  const scanState = rt.scan.state;
  useEffect(() => {
    if (scanState !== 'done' || !pending.current) return;
    const step = pending.current;
    pending.current = null;
    const r = sim.runStep(rt.id, proc.id, step);
    setHint(r.result === 'wait' ? r.reading : null);
  }, [scanState, rt.id, proc.id]);
  const scanning = scanState === 'run';
  const repair = (step: ProcStep) => {
    const rp = step.repair!;
    confirm({
      title: `Record repair: ${rp.label}?`,
      body: (
        <>
          <p>{rp.detail}</p>
          <p className="muted">Marks the work as done on RO {rt.v.ro} and changes the simulated car accordingly.</p>
        </>
      ),
      confirm: 'Record repair',
      tone: 'accent',
      onConfirm: () => {
        sim.applyFix(rt.id, rp.fix);
        sim.runStep(rt.id, proc.id, step);
        toast(`${rp.label} recorded on RO ${rt.v.ro}`);
        setHint(null);
      },
    });
  };
  return (
    <Panel
      className="st-proc"
      title={
        <>
          <Wrench size={18} aria-hidden="true" /> Guided procedure
        </>
      }
      sub={proc.title}
      id="proc-title"
      actions={
        <>
          <Badge tone={proc.basis === 'rm' ? 'ok' : 'accent'}>{proc.basis === 'rm' ? 'Toyota repair manual' : 'Console workflow'}</Badge>
          <button
            className="st-btn st-btn--sm"
            onClick={() => (sim.resetProcedure(rt.id, proc.id), setHint(null))}
            data-testid="proc-reset"
          >
            <RotateCcw size={14} aria-hidden="true" /> Restart
          </button>
        </>
      }
    >
      <p className="st-prose muted">{proc.intro}</p>
      <ol className="st-steps" data-testid="proc-steps">
        {path.map(({ step, res }, i) => {
          const isCur = !res && i === path.length - 1;
          return (
            <li
              key={step.key}
              className={`st-step${isCur ? ' is-current' : ''}${res ? ` is-${res.result}` : ''}`}
              data-testid={`step-${step.key}`}
            >
              <span className="st-step__n" aria-hidden="true">
                {res ? res.result === 'ng' ? <XCircle size={18} /> : <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
              </span>
              <div className="st-step__body">
                <p className="st-step__title">
                  {step.n ? (
                    <span className="st-step__num">Step {step.n}</span>
                  ) : step.console ? (
                    <span className="st-step__num is-console">Console</span>
                  ) : null}
                  {step.title}
                  {step.needsControl && <Lock size={13} aria-label="Needs control" />}
                </p>
                {(isCur || !res) && <p className="st-step__what">{step.what}</p>}
                {step.spec && <p className="st-step__spec">Spec: {step.spec}</p>}
                {res && res.reading && (
                  <p className={`st-step__reading is-${res.result}`}>
                    <b>{res.result === 'ok' ? 'OK' : res.result === 'ng' ? 'NG' : 'Done'}</b> {res.reading}
                  </p>
                )}
                {res && step.otherBranch && <p className="st-step__other">Other branch in the manual: {step.otherBranch}</p>}
                {isCur && (
                  <div className="st-step__tools">
                    <StepTool rt={rt} step={step} />
                    <div className="st-step__actions">
                      {step.repair ? (
                        <button className="st-btn st-btn--primary" onClick={() => repair(step)} data-testid="step-repair">
                          <Wrench size={16} aria-hidden="true" /> Record repair: {step.repair.label}
                        </button>
                      ) : step.hook === 'manual' ? (
                        <>
                          <button className="st-btn st-btn--ok" onClick={() => run(step, 'ok')} data-testid="step-ok">
                            {step.okLabel ?? 'OK'}
                          </button>
                          <button className="st-btn" onClick={() => run(step, 'ng')} data-testid="step-ng">
                            {step.ngLabel ?? 'NG'}
                          </button>
                        </>
                      ) : step.hook === 'info' ? (
                        <button className="st-btn st-btn--primary" onClick={() => run(step)} data-testid="step-next">
                          Done — next step
                        </button>
                      ) : (
                        <button
                          className="st-btn st-btn--primary"
                          onClick={() => run(step)}
                          disabled={step.hook === 'canCheck' && scanning}
                          data-testid="step-run"
                        >
                          {step.hook === 'canCheck' && scanning ? 'Checking modules…' : runLabel(step)}
                        </button>
                      )}
                    </div>
                    {hint && <p className="st-step__hint">{hint}</p>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {finished && (
        <div className="st-callout st-callout--ok" data-testid="proc-done">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>
            <b>Procedure complete.</b>{' '}
            {last.res?.result === 'ng'
              ? 'The manual continues on another branch — see the note above.'
              : 'Add the result to the repair order and road test.'}
          </span>
        </div>
      )}
      <p className="st-foot st-srcline">
        Source:{' '}
        {proc.src.map((k, i) => (
          <span key={k}>
            {i > 0 && ' · '}
            <a href={SOURCES[k].url} target="_blank" rel="noopener noreferrer" data-testid={`proc-src-${k}`}>
              {SOURCES[k].title.replace(/^Repair Manual RM30N0U — /, 'Repair manual: ')}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </span>
        ))}
      </p>
    </Panel>
  );
}

function runLabel(step: ProcStep): string {
  switch (step.hook) {
    case 'probeA41':
      return 'Measure resistance';
    case 'acPre':
      return 'Measure voltage';
    case 'acVacuum':
      return 'Run vacuum test';
    case 'misfireCounts':
      return 'Read misfire counts';
    case 'canCheck':
      return 'Run CAN bus check';
    case 'confirmCodes':
      return 'Confirm repair';
    case 'tpmsRegister':
      return 'Register new ID';
    case 'tpmsInit':
      return 'Run initialization';
    case 'crankTest':
    case 'batteryRest':
    case 'charging':
    case 'tpmsDrop':
    case 'tpmsConfirm':
      return 'Record result';
    default:
      return 'Run check';
  }
}

function StepTool({ rt, step }: { rt: Rt; step: ProcStep }): ReactNode {
  switch (step.hook) {
    case 'misfireCounts': {
      const vals = ['mf1', 'mf2', 'mf3', 'mf4'].map((id) => sim.read(rt, id));
      const mx = Math.max(20, ...vals.filter(Number.isFinite));
      return (
        <div className="st-mfbars" aria-label="Live misfire counts">
          {vals.map((v, i) => (
            <div key={i}>
              <span className="st-mfbars__bar">
                <span style={{ height: `${(Math.max(0, v || 0) / mx) * 100}%` }} className={v > 5 ? 'is-bad' : ''} />
              </span>
              <b className="mono">{Number.isFinite(v) ? v : '—'}</b>
              <small>Cyl {i + 1}</small>
            </div>
          ))}
          <p className="st-foot">Live from the road test. Counts climb when the load passes about 40 %.</p>
        </div>
      );
    }
    case 'probeA41':
      return (
        <div className="st-dmm">
          <div className="st-dmm__face">
            <span className="mono">{rt.steps['canSkid.s2'] ? (rt.steps['canSkid.s2'].result === 'ng' ? 'OL' : '60.0') : '- - -'}</span>
            <small>Ω</small>
          </div>
          <p>
            Probes on the harness side of <b>A41</b>: pin 25 (CANH, V) and pin 14 (CANL, W). Spec 54–69 Ω means the branch reaches both 120
            Ω terminators.
          </p>
        </div>
      );
    case 'acPre':
      return (
        <div className="st-dmm">
          <div className="st-dmm__face">
            <span className="mono">{rt.steps['acLow.s3'] ? (rt.fixed.has('acLeak') ? '1.92' : '0.61') : '- - -'}</span>
            <small>V</small>
          </div>
          <p>E37-9 (PRE) to body ground, ignition ON, A/C off. Spec 0.74–4.62 V.</p>
        </div>
      );
    case 'canCheck':
      return <BusDiagram rt={rt} />;
    case 'crankTest':
    case 'charging':
    case 'batteryRest':
      return (
        <>
          <ActiveTests vid={rt.id} compact />
          {step.hook === 'crankTest' && <CrankChart vid={rt.id} />}
          <p className="st-foot">
            Battery now: <b className="mono">{sim.read(rt, 'vbat').toFixed(2)} V</b> · engine{' '}
            {rt.engine === 'run' ? 'running' : rt.engine === 'crank' ? 'cranking' : 'off'}
          </p>
        </>
      );
    case 'tpmsDrop':
      return <ActiveTests vid={rt.id} />;
    case 'tpmsConfirm':
    case 'tpmsInit':
    case 'tpmsRegister':
      return (
        <div className="st-tpmsvals">
          {[1, 2, 3, 4].map((i) => {
            const v = sim.read(rt, `tp${i}`);
            return (
              <div key={i} className={Number.isFinite(v) ? '' : 'is-bad'}>
                <small>ID {i}</small>
                <b className="mono">{Number.isFinite(v) ? (v * 0.1450377).toFixed(1) : '—'}</b>
                <span>psi</span>
              </div>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}
