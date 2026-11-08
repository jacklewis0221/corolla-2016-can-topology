import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { SOURCES, type SourceKey } from '../data/sources';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  testId: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg__btn${value === o.value ? ' is-on' : ''}`}
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

export function ToggleChip({
  on,
  onChange,
  children,
  swatch,
  testId,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  swatch?: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      data-testid={testId}
    >
      {swatch && <span className={`chip__swatch sw-${swatch}`} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function SourceLinks({ keys, compact }: { keys: SourceKey[]; compact?: boolean }) {
  const uniq = [...new Set(keys)];
  return (
    <ul className={`srcs${compact ? ' srcs--compact' : ''}`}>
      {uniq.map((k) => {
        const s = SOURCES[k];
        return (
          <li key={k}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={`src src--${s.kind}`}>
              <span className="src__title">{s.title}</span>
              <span className="src__pub">
                {s.publisher}
                <ExternalLink size={12} aria-hidden="true" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function SectionHead({ kicker, title, children, id }: { kicker: string; title: string; children?: ReactNode; id: string }) {
  return (
    <header className="sec-head">
      <p className="kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {children && <div className="sec-head__lede">{children}</div>}
    </header>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export const BASIS_LABEL = {
  prefix: { text: 'Toyota frame name', tone: 'ok' as const, title: 'Sender inferred from the Toyota frame-name prefix in the reference DBC' },
  inferred: { text: 'inferred', tone: 'warn' as const, title: 'Sender inferred from wiring: the signal’s source switch or sensor is wired to this ECU' },
  unknown: { text: 'undocumented', tone: 'neutral' as const, title: 'Observed on the bus; no public description' },
  diagnostic: { text: 'diagnostic', tone: 'info' as const, title: 'Diagnostic request / response traffic' },
};
