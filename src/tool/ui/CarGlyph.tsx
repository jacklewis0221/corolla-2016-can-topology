/** Side-profile glyph of a compact sedan, painted with the vehicle's color. */
export function CarGlyph({ color, size = 96, moving }: { color: string; size?: number; moving?: boolean }) {
  return (
    <svg className={`st-car${moving ? ' is-moving' : ''}`} width={size} height={(size * 44) / 120} viewBox="0 0 120 44" aria-hidden="true">
      <ellipse cx="61" cy="40.5" rx="52" ry="2.6" className="st-car__shadow" />
      <path
        d="M8 33 L8 26 C8 23 10 22 13 22 L34 20 L48 11.5 C50 10.5 52 10 55 10 L74 10 C77 10 79 10.8 81 12 L95 20 L109 22.5 C112 23 114 25 114 28 L114 32 C114 33.5 113 34.5 111.5 34.5 L10 34.5 C9 34.5 8 34 8 33 Z"
        fill={color}
        className="st-car__body"
      />
      <path d="M37 20.5 L49 13 C50.5 12.2 52 12 54 12 L62 12 L62 20.5 Z" className="st-car__glass" />
      <path d="M65 12 L73.5 12 C76 12 78 12.6 80 13.6 L91 20.5 L65 20.5 Z" className="st-car__glass" />
      <path d="M10 27 L112 27" className="st-car__line" />
      <path d="M107 23.6 L113 25" className="st-car__lamp" />
      <g className="st-car__wheel">
        <circle cx="28" cy="34.5" r="6.6" />
        <circle cx="28" cy="34.5" r="2.6" className="st-car__hub" />
      </g>
      <g className="st-car__wheel">
        <circle cx="94" cy="34.5" r="6.6" />
        <circle cx="94" cy="34.5" r="2.6" className="st-car__hub" />
      </g>
    </svg>
  );
}
