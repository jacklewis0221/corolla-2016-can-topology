import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { SOURCES, type Source } from '../data/sources';
import { SectionHead } from './ui';

const LINKS = [
  { id: 'network', label: 'Network' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'frames', label: 'Frame lab' },
  { id: 'messages', label: 'Messages' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'sources', label: 'Sources' },
];

export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="logo">
      <rect x="1" y="1" width="32" height="32" rx="9" className="logo__bg" />
      <path d="M6 13 C 11 13, 11 21, 17 21 S 23 13, 28 13" className="logo__h" />
      <path d="M6 21 C 11 21, 11 13, 17 13 S 23 21, 28 21" className="logo__l" />
      <circle cx="6" cy="17" r="2.4" className="logo__dot" />
      <circle cx="28" cy="17" r="2.4" className="logo__dot" />
    </svg>
  );
}

export function TopNav({ theme, onTheme }: { theme: 'dark' | 'light'; onTheme: () => void }) {
  const [active, setActive] = useState<string>('');
  useEffect(() => {
    const els = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (ents) => {
        const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.1] },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <header className="nav">
      <div className="container nav__inner">
        <button className="nav__brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top" data-testid="nav-home">
          <Logo />
          <span>
            <b>Corolla LE</b> CAN Atlas
          </span>
        </button>
        <nav aria-label="Sections" className="nav__links">
          {LINKS.map((l) => (
            <button
              key={l.id}
              className={`nav__link${active === l.id ? ' is-on' : ''}`}
              onClick={() => document.getElementById(l.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-current={active === l.id ? 'true' : undefined}
              data-testid={`nav-${l.id}`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <button className="icon-btn" onClick={onTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} data-testid="theme-toggle">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

const GROUPS: { kind: Source['kind']; title: string; blurb: string }[] = [
  {
    kind: 'toyota',
    title: 'Toyota service information',
    blurb: 'New Car Features, electrical wiring diagrams and repair manual for the 2014–2015 Corolla (E170), mirrored publicly.',
  },
  { kind: 'community', title: 'Open-source CAN databases', blurb: 'comma.ai’s opendbc and openpilot, built from logged Toyota traffic.' },
  { kind: 'reference', title: 'Protocol references', blurb: 'Physical layer and LIN background.' },
  { kind: 'press', title: 'Model-year and trim details', blurb: 'What a 2016 LE came with, and its exterior dimensions.' },
];

export function Sources() {
  const all = Object.values(SOURCES) as Source[];
  return (
    <section className="section section--sources" aria-labelledby="sources-title" id="sources">
      <div className="container">
        <SectionHead kicker="06 · Sources & method" title="Where every line comes from" id="sources-title" />
        <div className="method">
          <div className="card method__card">
            <h3 className="card__title">Method and assumptions</h3>
            <ul className="facts">
              <li>
                The 2016 Corolla is the last year of the pre-facelift E170 body. Its wiring and network are taken from Toyota’s 2014–2015
                Corolla service publications for that body; the 2016 car is assumed to match them, not checked against 2016-specific manuals.
              </li>
              <li>Pins, wire colors and junction connectors come from the electrical wiring diagrams; locations from the parts-location drawings.</li>
              <li>Fail-safe behavior, DTCs and resistance specs come from the repair manual’s CAN communication chapter.</li>
              <li>
                CAN IDs come from openpilot’s log of a 2017 Corolla (same platform, one year newer), with the driver-assist frames a 2016 LE
                lacks removed, plus five scan-tool addresses from openpilot’s Toyota lists. Senders are inferred from Toyota frame-name
                prefixes or from which ECU owns the source switch — badges show which.
              </li>
              <li>The default build is a base LE (key start, Entune Audio). Presets add the Driver Convenience Package and the LE Eco engine.</li>
              <li>
                The 3D car is built to the LE’s published length, width, height, wheelbase, track and tire size; its surface is a simplified
                sedan shape, not a scan. The front/rear overhang split is estimated, module positions are approximate, and wires follow an
                illustrative harness route.
              </li>
              <li>Animations are slowed down roughly ten-thousand-fold: a real 8-byte frame lasts about a quarter of a millisecond.</li>
              <li>This is an independent educational project, not affiliated with or endorsed by Toyota.</li>
            </ul>
          </div>
          <div className="method__groups">
            {GROUPS.map((g) => {
              const list = all.filter((s) => s.kind === g.kind);
              if (g.kind === 'toyota') {
                const pubs = [
                  { k: 'New Car Features', title: 'New Car Features · NM30N0U', blurb: 'How each system works' },
                  { k: 'Electrical Wiring Diagram', title: 'Electrical Wiring Diagram · EM30N2U', blurb: 'Pins, wire colors, splices and part locations' },
                  { k: 'Repair Manual', title: 'Repair Manual · RM30N0U', blurb: 'Fail-safe, DTCs and bus checks' },
                ];
                const pubOf = (t: string) =>
                  t.startsWith('New Car Features') ? pubs[0].k : t.startsWith('Repair Manual') ? pubs[2].k : pubs[1].k;
                return (
                  <div key={g.kind} className="card srcgroup srcgroup--toyota">
                    <h3 className="card__title">
                      {g.title} <span className="muted">· {list.length}</span>
                    </h3>
                    <p className="card__hint">{g.blurb}</p>
                    <div className="srcpubs">
                      {pubs.map((pb) => {
                        const items = list.filter((s) => pubOf(s.title) === pb.k);
                        return (
                          <div key={pb.k} className="srcpub">
                            <h4>
                              {pb.title} <span className="muted">· {items.length}</span>
                            </h4>
                            <p className="srcpub__blurb">{pb.blurb}</p>
                            <ul className="srclist">
                              {items.map((s) => {
                                const parts = s.title.split(' — ');
                                const label = parts.length > 1 ? parts.slice(1).join(' — ') : s.title;
                                const pre = parts[0].startsWith('EWD Position of Parts') ? 'Parts location: ' : '';
                                return (
                                  <li key={s.url}>
                                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                                      {pre}
                                      {label}
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <div key={g.kind} className="card srcgroup">
                  <h3 className="card__title">
                    {g.title} <span className="muted">· {list.length}</span>
                  </h3>
                  <p className="card__hint">{g.blurb}</p>
                  <ul className="srclist">
                    {list.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title}
                        </a>
                        <span className="muted"> — {s.publisher}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo />
          <span>
            <b>Corolla LE CAN Atlas</b> — a static, offline-friendly explainer. No backend, no tracking.
          </span>
        </div>
        <p className="muted">Built from public Toyota service information and open-source CAN databases. Not affiliated with Toyota.</p>
      </div>
    </footer>
  );
}
