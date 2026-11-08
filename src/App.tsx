import { useCallback, useEffect, useState } from 'react';
import { TopNav, Sources, Footer } from './components/Chrome';
import { Hero, Primer } from './components/Hero';
import { Topology } from './components/Topology';
import { Scenarios } from './components/Scenarios';
import { FrameLab, LAB } from './components/FrameLab';
import { MessageTable } from './components/MessageTable';
import { ServiceTeaser } from './components/ServiceTeaser';
import { MESSAGES } from './data/messages';
import { Diagnostics } from './components/Diagnostics';

type Theme = 'dark' | 'light';

/**
 * Deep link from the service console's bus monitor: ?lab=0x1C4 opens that frame in the frame lab, or in the
 * message dictionary when the lab has no controls for it (?msg=0x3BC goes straight to the dictionary).
 */
function deepLink(): { lab?: number; msg?: number } {
  try {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get('lab') ?? q.get('msg');
    if (!raw) return {};
    const id = parseInt(raw.replace(/^0x/i, ''), 16);
    if (!Number.isFinite(id)) return {};
    if (q.get('lab') && LAB.some((l) => l.id === id)) return { lab: id };
    return MESSAGES.some((m) => m.id === id) ? { msg: id } : {};
  } catch {
    return {};
  }
}

function initialTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [link] = useState(deepLink);
  const [lab, setLab] = useState<{ id: number; seed?: Record<string, number> }>({ id: link.lab ?? 0x1c4 });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Scroll to the deep-linked frame once layout settles; a second pass corrects for late layout unless the reader has scrolled.
  useEffect(() => {
    if (link.lab == null && link.msg == null) return;
    const target = () =>
      link.lab != null
        ? document.getElementById('frames')
        : (document.querySelector(`[data-msg-row="${link.msg}"]`) ?? document.getElementById('messages'));
    // 'instant' overrides the page's smooth scrolling: a deep link should land on the frame, not travel there.
    const go = () => target()?.scrollIntoView({ block: link.lab != null ? 'start' : 'center', behavior: 'instant' });
    let user = false;
    const mark = () => (user = true);
    const evs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true, once: true }));
    const t1 = window.setTimeout(go, 250);
    const t2 = window.setTimeout(() => !user && go(), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      evs.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [link]);

  const openLab = useCallback((id: number, values?: Record<string, number>) => {
    setLab({ id: LAB.some((l) => l.id === id) ? id : LAB[0].id, seed: values });
    requestAnimationFrame(() => document.getElementById('frames')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  const skip = () => {
    const main = document.getElementById('main');
    main?.focus({ preventScroll: true });
    main?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <button className="skip" onClick={skip} data-testid="skip-link">
        Skip to the network diagram
      </button>
      <TopNav theme={theme} onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Primer />
        <Topology />
        <Scenarios onOpenLab={openLab} />
        <FrameLab msgId={lab.id} seed={lab.seed} onMsg={(id) => setLab({ id })} />
        <MessageTable initialOpen={link.msg} />
        <Diagnostics />
        <ServiceTeaser />
        <Sources />
      </main>
      <Footer />
    </>
  );
}
