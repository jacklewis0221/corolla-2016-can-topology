import { useCallback, useEffect, useState } from 'react';
import { TopNav, Sources, Footer } from './components/Chrome';
import { Hero, Primer } from './components/Hero';
import { Topology } from './components/Topology';
import { Scenarios } from './components/Scenarios';
import { FrameLab, LAB } from './components/FrameLab';
import { MessageTable } from './components/MessageTable';
import { Diagnostics } from './components/Diagnostics';

type Theme = 'dark' | 'light';

function initialTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [lab, setLab] = useState<{ id: number; seed?: Record<string, number> }>({ id: 0x1c4 });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
        <MessageTable />
        <Diagnostics />
        <Sources />
      </main>
      <Footer />
    </>
  );
}
