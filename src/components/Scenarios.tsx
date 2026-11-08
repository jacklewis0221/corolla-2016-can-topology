import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Microscope } from 'lucide-react';
import { SCENARIOS, type Scenario } from '../data/scenarios';
import { MESSAGE_BY_ID, hex } from '../data/messages';
import { Diagram } from './Diagram';
import { SectionHead, SourceLinks } from './ui';
import { ALL_LAYERS, PRESETS, presentEdges, scheduleBroadcast, scheduleHop } from '../lib/model';
import { usePrefersReducedMotion, useTraffic } from '../lib/hooks';
import { encode, toHex, toyotaChecksum, decode, fmt } from '../lib/can';
import { silenceReport } from './Inspector';
import { LAB } from './FrameLab';

export function FrameCard({
  msgId,
  values,
  onOpenLab,
}: {
  msgId: number;
  values: Record<string, number>;
  onOpenLab?: (id: number, values: Record<string, number>) => void;
}) {
  const m = MESSAGE_BY_ID[msgId];
  if (!m) return null;
  const sigs = m.signals ?? [];
  const data = encode(m.dlc, sigs, values);
  if (sigs.some((s) => s.name === 'CHECKSUM')) data[m.dlc - 1] = toyotaChecksum(m.id, data);
  const shown = sigs.filter((s) => s.name in values || s.name === 'CHECKSUM');
  return (
    <div className="framecard" data-testid="frame-card">
      <div className="framecard__head">
        <span className="framecard__id">{hex(m.id)}</span>
        <span className="framecard__names">
          {m.toyota && <b>{m.toyota}</b>}
          {m.dbc && <span>{m.dbc}</span>}
        </span>
        <span className="framecard__dlc">DLC {m.dlc}</span>
      </div>
      <div className="bytes" role="list" aria-label="Data bytes">
        {data.map((b, i) => (
          <div key={i} className={`byte${b ? ' is-set' : ''}`} role="listitem">
            <span className="byte__i">B{i}</span>
            <span className="byte__v">{toHex(b)}</span>
          </div>
        ))}
      </div>
      <dl className="decoded">
        {shown.map((s) => {
          const v = decode(data, s);
          const label = s.values?.[Math.round(v)];
          return (
            <div key={s.name}>
              <dt>{s.name}</dt>
              <dd>
                {s.name === 'CHECKSUM' ? `0x${toHex(Math.round(v))}` : `${fmt(v, s)}${s.unit ? ` ${s.unit}` : ''}`}
                {label && <em> = {label}</em>}
              </dd>
            </div>
          );
        })}
      </dl>
      {onOpenLab && LAB.some((l) => l.id === m.id) && (
        <button className="btn btn--sm" onClick={() => onOpenLab(m.id, values)} data-testid="open-lab">
          <Microscope size={15} aria-hidden="true" /> See it on the wire
        </button>
      )}
    </div>
  );
}

export function Scenarios({ onOpenLab }: { onOpenLab: (id: number, values: Record<string, number>) => void }) {
  const reduced = usePrefersReducedMotion();
  const [sid, setSid] = useState(SCENARIOS[0].id);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const traffic = useTraffic();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useRef(false);

  const sc: Scenario = SCENARIOS.find((s) => s.id === sid)!;
  const st = sc.steps[step];
  const opts = PRESETS[sc.preset].opts;
  const edges = useMemo(() => presentEdges(opts), [opts]);

  // fire the step's traffic
  useEffect(() => {
    traffic.clear();
    if (reduced) return;
    const now = performance.now() + 250;
    const timers: number[] = [];
    for (const h of st.hops ?? []) {
      timers.push(window.setTimeout(() => traffic.add(scheduleHop(h.edge, Boolean(h.reverse), performance.now())), (h.delay ?? 0) * 1000 + 250));
    }
    for (const b of st.broadcasts ?? []) {
      timers.push(
        window.setTimeout(
          () =>
            traffic.add(
              scheduleBroadcast(b.from, edges, performance.now(), { bus: b.bus, label: b.msg !== null ? hex(b.msg) : undefined, to: b.to }),
            ),
          (b.delay ?? 0) * 1000 + 250,
        ),
      );
    }
    void now;
    return () => timers.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, step, run, reduced]);

  const go = useCallback(
    (d: number) => {
      setStep((s) => {
        const n = s + d;
        if (n < 0) return 0;
        if (n >= sc.steps.length) {
          setPlaying(false);
          return sc.steps.length - 1;
        }
        return n;
      });
    },
    [sc.steps.length],
  );

  // autoplay
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (step >= sc.steps.length - 1) setPlaying(false);
      else go(1);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [playing, step, sc.steps.length, go]);

  // keyboard while the section is on screen
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => (inView.current = ents[0].isIntersecting && ents[0].intersectionRatio > 0.35), {
      threshold: [0, 0.35, 0.6],
    });
    io.observe(el);
    const onKey = (e: KeyboardEvent) => {
      if (!inView.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      io.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, [go]);

  const pick = (id: string) => {
    setSid(id);
    setStep(0);
    setPlaying(false);
  };

  const silentReport = st.silent ? silenceReport(st.silent, opts) : null;

  return (
    <section className="section section--scenarios" aria-labelledby="scenarios-title" id="scenarios" ref={sectionRef}>
      <div className="container">
        <SectionHead kicker="02 · Scenarios" title="Watch the car think" id="scenarios-title">
          <p>
            Step through everyday moments and see which modules talk, over which wire, and what the frame says. Use the arrow keys or
            the buttons; timings are slowed down so you can follow them.
          </p>
        </SectionHead>

        <div className="sc-tabs" role="tablist" aria-label="Scenarios">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === sid}
              className={`sc-tab${s.id === sid ? ' is-on' : ''}`}
              onClick={() => pick(s.id)}
              data-testid={`scenario-${s.id}`}
            >
              <span className="sc-tab__n">{String(i + 1).padStart(2, '0')}</span>
              <span className="sc-tab__t">{s.title}</span>
              <span className="sc-tab__s">{s.tagline}</span>
            </button>
          ))}
        </div>

        <div className="sc-stage" id="scenario-stage">
          <div className="sc-caption">
            <button className="icon-btn icon-btn--ghost" onClick={() => go(-1)} disabled={step === 0} aria-label="Previous step" data-testid="cap-prev">
              <ChevronLeft size={18} />
            </button>
            <span className="sc-caption__step">
              {step + 1}/{sc.steps.length}
            </span>
            <span className="sc-caption__title">{st.title}</span>
            {st.frame && <code className="sc-caption__frame">{hex(st.frame.msg)}</code>}
            <button
              className="icon-btn icon-btn--ghost"
              onClick={() => go(1)}
              disabled={step === sc.steps.length - 1}
              aria-label="Next step"
              data-testid="cap-next"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="stage__scroll">
            <Diagram
              opts={opts}
              layers={ALL_LAYERS}
              t={0}
              focus={st.focus}
              silent={st.silent ?? null}
              dtcBadges={silentReport?.badges}
              packets={traffic.packets}
              pulses={traffic.pulses}
              now={traffic.now}
              pulseMs={traffic.pulseMs}
              title={`Scenario: ${sc.title}, step ${step + 1}: ${st.title}`}
              testId="scn"
            />
          </div>
        </div>

        <div className="sc-panel" aria-live="polite">
          <div className="sc-panel__main">
            <div className="sc-steps" aria-label="Steps">
              {sc.steps.map((s, i) => (
                <button
                  key={s.title}
                  className={`sc-dot${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`}
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? 'step' : undefined}
                  data-testid={`step-${i}`}
                >
                  {i + 1}
                </button>
              ))}
              <span className="sc-steps__meta">
                {PRESETS[sc.preset].label} · step {step + 1} of {sc.steps.length}
              </span>
            </div>
            <h3 className="sc-title">{st.title}</h3>
            <p className="sc-body">{st.body}</p>
            {st.wired && (
              <div className="wired">
                <span className="wired__label">Hard-wired here</span>
                {st.wired.map((w) => (
                  <span key={w} className="wired__chip">
                    {w}
                  </span>
                ))}
              </div>
            )}
            {st.note && <p className="sc-note">{st.note}</p>}
            <div className="sc-controls">
              <button className="btn" onClick={() => go(-1)} disabled={step === 0} aria-label="Previous step" data-testid="step-prev">
                <ChevronLeft size={18} aria-hidden="true" /> Back
              </button>
              <button className="btn btn--accent" onClick={() => setPlaying((p) => !p)} data-testid="step-play">
                {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                {playing ? 'Pause' : 'Auto-play'}
              </button>
              <button className="btn" onClick={() => setRun((r) => r + 1)} aria-label="Replay step" data-testid="step-replay">
                <RotateCcw size={16} aria-hidden="true" /> Replay
              </button>
              <button
                className="btn"
                onClick={() => go(1)}
                disabled={step === sc.steps.length - 1}
                aria-label="Next step"
                data-testid="step-next"
              >
                Next <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <details className="sc-src">
              <summary>Sources for this step</summary>
              <SourceLinks keys={st.sources} compact />
            </details>
          </div>
          <div className="sc-panel__side">
            {st.frame ? (
              <FrameCard msgId={st.frame.msg} values={st.frame.values} onOpenLab={onOpenLab} />
            ) : (
              <div className="framecard framecard--empty">
                <p>
                  {st.silent
                    ? 'Nothing to decode: the module has gone quiet. The red tags on the map are the trouble codes its partners store.'
                    : st.hops?.length
                    ? 'This step uses a point-to-point line, not CAN — watch the colored dot travel the wire.'
                    : st.broadcasts?.length
                      ? 'The exact frame for this request is not in public documentation, so only the path is shown.'
                      : 'No network traffic in this step: everything happens on wires owned by one ECU.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
