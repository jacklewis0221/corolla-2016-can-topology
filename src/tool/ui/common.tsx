import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`st-badge st-badge--${tone}`}>
      {dot && <i className="st-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  sub,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  sub?: ReactNode;
  id?: string;
}) {
  return (
    <section className={`st-panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      {(title || actions) && (
        <header className="st-panel__head">
          <div>
            {title && (
              <h3 className="st-panel__title" id={id}>
                {title}
              </h3>
            )}
            {sub && <p className="st-panel__sub">{sub}</p>}
          </div>
          {actions && <div className="st-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
  small,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  testId: string;
  small?: boolean;
}) {
  return (
    <div className={`st-seg${small ? ' st-seg--sm' : ''}`} role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
          title={o.title}
          data-testid={`${testId}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** In-page modal dialog with focus management, Escape to close and a backdrop click. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  testId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const el = ref.current;
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        );
        if (!items.length) return;
        const a = items[0];
        const b = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="st-modal" data-testid={testId} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`st-modal__box${wide ? ' st-modal__box--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        ref={ref}
      >
        <header className="st-modal__head">
          <h2 id={`${testId}-title`}>{title}</h2>
          <button className="st-icon" onClick={onClose} aria-label="Close" data-testid={`${testId}-close`}>
            <X size={18} />
          </button>
        </header>
        <div className="st-modal__body">{children}</div>
        {footer && <footer className="st-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="st-empty">
      {icon && <div className="st-empty__icon">{icon}</div>}
      <p className="st-empty__title">{title}</p>
      {children && <div className="st-empty__body">{children}</div>}
    </div>
  );
}

export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="st-kv">
      <dt>{k}</dt>
      <dd className={mono ? 'mono' : undefined}>{v}</dd>
    </div>
  );
}

export const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
export const hexId = (n: number) => n.toString(16).toUpperCase().padStart(3, '0');

export function clock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
