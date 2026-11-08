import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CircleAlert,
  ClipboardList,
  Gauge as GaugeIcon,
  History as HistoryIcon,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Moon,
  Network,
  Search,
  Stethoscope,
  Sun,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { usePrefersReducedMotion } from '../lib/hooks';
import { VEHICLES, VEHICLE_BY_ID, vehicleTitle, YOU } from './data/fleet';
import type { Units } from './data/signals';
import { sim } from './sim/engine';
import { PrefsCtx, useSim } from './sim/hooks';
import { ActCtx, useActions, type Actions, type ConfirmOpts, type View } from './actions';
import { Dialog, Seg } from './ui/common';
import { ShopFloor } from './views/Floor';
import { VehicleBar } from './views/VehicleBar';
import { Health } from './views/Health';
import { Live } from './views/Live';
import { Codes } from './views/Codes';
import { Bus } from './views/Bus';
import { HistoryView } from './views/History';
import { Maint } from './views/Maint';
import { Pages } from './views/Pages';
import { About } from './views/About';

type Theme = 'dark' | 'light';

const NAV: { id: View; label: string; icon: typeof Activity; vehicle?: boolean }[] = [
  { id: 'floor', label: 'Shop floor', icon: LayoutDashboard },
  { id: 'health', label: 'Health check', icon: Stethoscope, vehicle: true },
  { id: 'live', label: 'Live data', icon: Activity, vehicle: true },
  { id: 'codes', label: 'Codes & guided fixes', icon: Wrench, vehicle: true },
  { id: 'bus', label: 'Bus monitor', icon: Network, vehicle: true },
  { id: 'history', label: 'Vehicle history', icon: HistoryIcon, vehicle: true },
  { id: 'maint', label: 'Maintenance & advisor', icon: ClipboardList, vehicle: true },
  { id: 'pages', label: 'Service pages', icon: LayoutGrid, vehicle: true },
];

const VIEW_IDS = NAV.map((n) => n.id);

function initial() {
  let view: View = 'floor';
  let vid = 'bay3';
  try {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('view') as View | null;
    const c = q.get('vehicle');
    if (v && VIEW_IDS.includes(v)) view = v;
    if (c && VEHICLE_BY_ID[c]) vid = c;
  } catch {
    /* opaque origin or no search params */
  }
  return { view, vid };
}

function initialTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const init = useMemo(initial, []);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [units, setUnits] = useState<Units>('us');
  const reduced = usePrefersReducedMotion();
  const [view, setView] = useState<View>(init.view);
  const [vid, setVid] = useState(init.vid);
  const [tabs, setTabs] = useState<string[]>(() => [...new Set(['road', 'bay3', init.vid])]);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    sim.start();
    const onVis = () => {
      sim.paused = document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      sim.stop();
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const open = useCallback((id: string, v?: View) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setVid(id);
    setView(v ?? 'health');
    setNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    setNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const control = useCallback(
    (id: string, what: string, then: () => void) => {
      const rt = sim.byId[id];
      if (rt.holder === YOU) return then();
      setConfirm({
        title: `Take control of ${rt.v.slot}?`,
        body: (
          <>
            <p>
              <b>{rt.holder}</b> holds control of this vehicle. {what} needs exclusive control, so two technicians can never command the
              same car at once. Everyone else keeps read access.
            </p>
            <p className="muted">The handoff is simulated: the other console accepts after a moment.</p>
          </>
        ),
        confirm: 'Request control',
        tone: 'accent',
        onConfirm: () => {
          sim.requestControl(id);
          showToast(`Requested control of ${rt.v.slot} from ${rt.holder}…`);
          window.setTimeout(() => {
            if (sim.byId[id].holder === YOU) then();
          }, 1700);
        },
      });
    },
    [showToast],
  );

  const read = useCallback((id: string, what: string, then: () => void) => {
    const rt = sim.byId[id];
    if (rt.mode === 'read') return then();
    setConfirm({
      title: 'Open a read session?',
      body: (
        <p>
          {rt.v.adapter.id} is in <b>listen-only</b> mode: it never transmits, so it only sees broadcast frames. {what} sends diagnostic
          requests on the bus.
        </p>
      ),
      confirm: 'Open read session',
      tone: 'accent',
      onConfirm: () => {
        sim.setMode(id, 'read');
        then();
      },
    });
  }, []);

  const actions: Actions = useMemo(
    () => ({ vid, view, open, go, confirm: setConfirm, control, read, toast: showToast, focusCode, setFocusCode }),
    [vid, view, open, go, control, read, showToast, focusCode],
  );

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== id);
      if (id === vid) {
        if (next.length) setVid(next[next.length - 1]);
        else setView('floor');
      }
      return next;
    });
  };

  const v = VEHICLE_BY_ID[vid];
  const isVehicleView = view !== 'floor';

  return (
    <PrefsCtx.Provider value={{ units, reduced }}>
      <ActCtx.Provider value={actions}>
        <div className="st-app">
          <TitleBar
            theme={theme}
            onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            units={units}
            onUnits={setUnits}
            onMenu={() => setNavOpen((o) => !o)}
            navOpen={navOpen}
          />
          <div className="st-shell">
            <nav className={`st-rail${navOpen ? ' is-open' : ''}`} aria-label="Console sections" data-testid="rail">
              <div className="st-rail__group">
                <p className="st-rail__label">Shop</p>
                <RailBtn item={NAV[0]} active={view === 'floor'} onClick={() => go('floor')} />
              </div>
              <div className="st-rail__group">
                <p className="st-rail__label">
                  Vehicle · <span className="st-rail__veh">{v.slot}</span>
                </p>
                {NAV.slice(1, 7).map((n) => (
                  <RailBtn key={n.id} item={n} active={view === n.id} onClick={() => go(n.id)} />
                ))}
              </div>
              <div className="st-rail__group">
                <p className="st-rail__label">Workspace</p>
                <RailBtn item={NAV[7]} active={view === 'pages'} onClick={() => go('pages')} />
              </div>
              <div className="st-rail__foot">
                <button className="st-rail__btn" onClick={() => setAbout(true)} data-testid="about-open">
                  <BookOpen size={18} aria-hidden="true" />
                  <span>About this concept</span>
                </button>
                <a className="st-rail__btn" href="./index.html" data-testid="rail-atlas">
                  <ArrowLeft size={18} aria-hidden="true" />
                  <span>Back to the CAN atlas</span>
                </a>
              </div>
            </nav>
            {navOpen && <button className="st-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} data-testid="rail-scrim" />}
            <main className="st-main" id="st-main" ref={mainRef} tabIndex={-1}>
              {isVehicleView && <VehicleBar tabs={tabs} vid={vid} onPick={(id) => open(id, view)} onClose={closeTab} />}
              <div className="st-view" key={`${view}-${isVehicleView ? vid : ''}`}>
                {view === 'floor' && <ShopFloor />}
                {view === 'health' && <Health vid={vid} />}
                {view === 'live' && <Live vid={vid} />}
                {view === 'codes' && <Codes vid={vid} />}
                {view === 'bus' && <Bus vid={vid} />}
                {view === 'history' && <HistoryView vid={vid} />}
                {view === 'maint' && <Maint vid={vid} />}
                {view === 'pages' && <Pages vid={vid} />}
              </div>
            </main>
          </div>
          <Dialog
            open={!!confirm}
            title={confirm?.title ?? ''}
            onClose={() => setConfirm(null)}
            testId="confirm"
            footer={
              <>
                <button className="st-btn" onClick={() => setConfirm(null)} data-testid="confirm-cancel">
                  Cancel
                </button>
                <button
                  className={`st-btn st-btn--${confirm?.tone === 'danger' ? 'danger' : 'primary'}`}
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    c?.onConfirm();
                  }}
                  data-testid="confirm-ok"
                  data-autofocus
                >
                  {confirm?.confirm}
                </button>
              </>
            }
          >
            {confirm?.body}
          </Dialog>
          <About open={about} onClose={() => setAbout(false)} />
          <div className="st-toast" role="status" aria-live="polite" data-testid="toast">
            {toast && (
              <div className="st-toast__msg">
                <CircleAlert size={16} aria-hidden="true" />
                {toast}
              </div>
            )}
          </div>
        </div>
      </ActCtx.Provider>
    </PrefsCtx.Provider>
  );
}

function RailBtn({ item, active, onClick }: { item: (typeof NAV)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className={`st-rail__btn${active ? ' is-on' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.id}`}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function TitleBar({
  theme,
  onTheme,
  units,
  onUnits,
  onMenu,
  navOpen,
}: {
  theme: Theme;
  onTheme: () => void;
  units: Units;
  onUnits: (u: Units) => void;
  onMenu: () => void;
  navOpen: boolean;
}) {
  useSim(1);
  const { open } = useActions();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const hits = q.trim()
    ? VEHICLES.filter((v) =>
        [v.slot, v.customer, v.ro, v.plate, v.vin8, vehicleTitle(v), v.color].join(' ').toLowerCase().includes(q.trim().toLowerCase()),
      ).slice(0, 6)
    : [];
  const connected = sim.rts.length;
  const fps = sim.rts.reduce((s, r) => s + r.link.fps, 0);
  const now = new Date();
  return (
    <header className="st-title">
      <button
        className="st-icon st-title__menu"
        onClick={onMenu}
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        data-testid="menu-toggle"
      >
        {navOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className="st-brand">
        <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
          <rect x="1" y="1" width="32" height="32" rx="9" className="st-brand__bg" />
          <rect x="7" y="9" width="20" height="13" rx="2.5" className="st-brand__screen" />
          <path d="M12 26h10" className="st-brand__stand" />
          <path d="M10.5 17.5l3-3 2.5 2.5 4-4" className="st-brand__line" />
        </svg>
        <div className="st-brand__text">
          <b>Service Console</b>
          <span>Dealer service drive · 8 bays</span>
        </div>
        <span className="st-concept">Concept</span>
      </div>
      <div className="st-search">
        <Search size={16} aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => window.setTimeout(() => setFocus(false), 150)}
          placeholder="Find RO, plate, VIN, customer…"
          aria-label="Find a vehicle"
          data-testid="search"
        />
        {focus && hits.length > 0 && (
          <ul className="st-search__hits" role="listbox" aria-label="Matching vehicles">
            {hits.map((v) => (
              <li key={v.id}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    open(v.id);
                    setQ('');
                  }}
                  data-testid={`search-hit-${v.id}`}
                >
                  <i className="st-swatch" style={{ background: v.swatch }} aria-hidden="true" />
                  <b>{v.slot}</b> {vehicleTitle(v)}{' '}
                  <span className="muted">
                    · RO {v.ro} · {v.customer}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="st-title__right">
        <div className="st-net" title="Shop network">
          <Wifi size={16} aria-hidden="true" />
          <span>
            <b>{connected}</b> adapters · <span className="mono">{(fps / 1000).toFixed(1)}k</span> frames/s
          </span>
        </div>
        <Seg
          small
          value={units}
          onChange={onUnits}
          label="Units"
          testId="units"
          options={[
            { value: 'us', label: 'US' },
            { value: 'metric', label: 'Metric' },
          ]}
        />
        <span className="st-clock mono" aria-label="Shop time">
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
        <button
          className="st-icon"
          onClick={onTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          data-testid="theme-toggle"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <a className="st-btn st-btn--ghost st-title__atlas" href="./index.html" data-testid="title-atlas">
          <GaugeIcon size={16} aria-hidden="true" />
          <span>CAN atlas</span>
        </a>
      </div>
    </header>
  );
}
