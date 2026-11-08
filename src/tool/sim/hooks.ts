import { createContext, useContext, useSyncExternalStore } from 'react';
import { sim } from './engine';
import type { Units } from '../data/signals';

export interface ToolPrefs {
  units: Units;
  reduced: boolean;
}

export const PrefsCtx = createContext<ToolPrefs>({ units: 'us', reduced: false });
export const usePrefs = () => useContext(PrefsCtx);

/**
 * Re-render at most `hz` times a second while the simulation runs (and immediately after any action).
 * The snapshot is a number, so React skips renders when the quantized tick has not changed.
 */
export function useSim(hz = 4): number {
  const { reduced } = usePrefs();
  const rate = reduced ? Math.min(hz, 1) : hz;
  const div = Math.max(1, Math.round(10 / rate));
  return useSyncExternalStore(sim.subscribe, () => Math.floor(sim.tick / div) + sim.rev * 1e6);
}
