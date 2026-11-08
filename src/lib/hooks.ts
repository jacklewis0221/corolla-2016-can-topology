import { useCallback, useEffect, useRef, useState } from 'react';
import type { Packet, Pulse } from './model';
import { easeInOut } from './geometry';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const PULSE_MS = 900;

/** Packets and pulses with a requestAnimationFrame clock that only runs while something is moving. */
export function useTraffic() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const raf = useRef<number | null>(null);
  const live = useRef({ packets, pulses });
  live.current = { packets, pulses };

  const tick = useCallback(() => {
    const t = performance.now();
    setNow(t);
    const { packets: p, pulses: q } = live.current;
    const keepP = p.filter((x) => t < x.start + x.dur + 40);
    const keepQ = q.filter((x) => t < x.start + PULSE_MS);
    if (keepP.length !== p.length) setPackets(keepP);
    if (keepQ.length !== q.length) setPulses(keepQ);
    if (keepP.length || keepQ.length) raf.current = requestAnimationFrame(tick);
    else raf.current = null;
  }, []);

  const add = useCallback(
    (s: { packets: Packet[]; pulses: Pulse[] }) => {
      setPackets((p) => [...p, ...s.packets]);
      setPulses((q) => [...q, ...s.pulses]);
      if (raf.current === null) raf.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const clear = useCallback(() => {
    setPackets([]);
    setPulses([]);
  }, []);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  return { packets, pulses, now, add, clear, pulseMs: PULSE_MS };
}

/** Animate a 0→1 morph value toward a target with easing. */
export function useMorph(target: 0 | 1, reduced: boolean, ms = 950): number {
  const [t, setT] = useState<number>(target);
  const from = useRef<number>(target);
  const startAt = useRef<number>(0);
  const raf = useRef<number | null>(null);
  const cur = useRef<number>(target);
  cur.current = t;

  useEffect(() => {
    if (reduced) {
      setT(target);
      return;
    }
    from.current = cur.current;
    startAt.current = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - startAt.current) / ms);
      const e = easeInOut(k);
      setT(from.current + (target - from.current) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target, reduced, ms]);

  return t;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
