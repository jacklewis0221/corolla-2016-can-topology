import { createContext, useContext, type ReactNode } from 'react';

export type View = 'floor' | 'health' | 'live' | 'codes' | 'bus' | 'history' | 'maint' | 'pages';

export interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirm: string;
  tone?: 'danger' | 'accent';
  onConfirm: () => void;
}

export interface Actions {
  vid: string;
  view: View;
  open: (vid: string, view?: View) => void;
  go: (view: View) => void;
  confirm: (o: ConfirmOpts) => void;
  /** Run `then` once this console holds exclusive control of the vehicle (asks for a handoff if needed). */
  control: (vid: string, what: string, then: () => void) => void;
  /** Run `then` once the adapter is allowed to transmit diagnostic requests. */
  read: (vid: string, what: string, then: () => void) => void;
  toast: (msg: string) => void;
  focusCode: string | null;
  setFocusCode: (c: string | null) => void;
}

export const ActCtx = createContext<Actions | null>(null);

export function useActions(): Actions {
  const a = useContext(ActCtx);
  if (!a) throw new Error('ActCtx missing');
  return a;
}
