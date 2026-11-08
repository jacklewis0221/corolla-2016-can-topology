/** Top-down silhouette of an E170 Corolla sedan, front to the right, driver side on top. */
export function CarOutline({ opacity }: { opacity: number }) {
  if (opacity <= 0.01) return null;
  return (
    <g className="car" style={{ opacity }} aria-hidden="true">
      {/* wheels */}
      {[
        [1238, 258],
        [1238, 702],
        [342, 258],
        [342, 702],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={126} height={40} rx={12} className="car__wheel" />
      ))}
      {/* body shell */}
      <path
        className="car__body"
        d="M180,290 C138,292 116,322 112,372 L112,628 C116,678 138,708 180,710 L1330,710 C1420,708 1478,670 1490,606 L1494,500 L1490,394 C1478,330 1420,292 1330,290 Z"
      />
      {/* mirrors */}
      <path className="car__body" d="M1118,290 l-26,-26 a10,10 0 0 1 14,-6 l34,32 Z" />
      <path className="car__body" d="M1118,710 l-26,26 a10,10 0 0 0 14,6 l34,-32 Z" />
      {/* glasshouse */}
      <path
        className="car__glass"
        d="M1138,336 C1196,350 1228,392 1236,446 L1236,554 C1228,608 1196,650 1138,664 L1124,664 L1124,336 Z"
      />
      <path className="car__glass" d="M470,346 C426,362 402,398 396,448 L396,552 C402,602 426,638 470,654 L482,654 L482,346 Z" />
      <path className="car__roof" d="M492,334 L1112,334 Q1124,334 1124,346 L1124,654 Q1124,666 1112,666 L492,666 Q482,666 482,654 L482,346 Q482,334 492,334 Z" />
      {/* hood, engine and dash */}
      <path className="car__line" d="M1250,302 C1262,380 1266,440 1266,500 C1266,560 1262,620 1250,698" />
      <rect className="car__engine" x={1262} y={392} width={150} height={216} rx={18} />
      <path className="car__line" d="M1124,300 C1104,380 1100,440 1100,500 C1100,560 1104,620 1124,700" />
      {/* seats */}
      <rect className="car__seat" x={812} y={344} width={118} height={122} rx={22} />
      <rect className="car__seat" x={812} y={534} width={118} height={122} rx={22} />
      <rect className="car__seat" x={560} y={350} width={112} height={300} rx={26} />
      {/* steering wheel */}
      <rect className="car__wheelrim" x={972} y={352} width={20} height={88} rx={10} />
      {/* trunk line */}
      <path className="car__line" d="M396,304 C376,380 372,440 372,500 C372,560 376,620 396,696" />
      <text className="car__tag" x={1500} y={252} textAnchor="end">
        FRONT →
      </text>
      <text className="car__tag" x={120} y={252}>
        DRIVER SIDE
      </text>
      <text className="car__tag" x={120} y={760}>
        PASSENGER SIDE
      </text>
    </g>
  );
}
