/**
 * Where a sponsor might appear, drawn.
 *
 * An illustration and nothing more, and it says so in its own label: not the organizer's inventory,
 * not a photograph, and never a promise of size, position or count. It is here so somebody choosing
 * between "a program credit" and "foyer signage" can see the difference at a glance before they
 * read the words. The shape is chosen by the template's section (`surfaces.group_key`), which is
 * data, so a category added in SQL gets the plain frame until somebody draws it one.
 *
 * Drawn in the page's own tokens: the room in `line`, the sponsor's place in the accent.
 */
export function PlacementDiagram({ group, name, className = "" }: { group: string; name: string; className?: string }) {
  const Shape = SHAPES[group] ?? Frame;
  return (
    <figure className={`m-0 ${className}`}>
      <div role="img" aria-label={`Illustration of where a sponsor might appear for ${name}. Not your inventory or a photograph.`} className="edge overflow-hidden bg-ground">
        <svg viewBox="0 0 320 160" className="block h-auto w-full" aria-hidden="true">
          <Shape />
        </svg>
      </div>
      <figcaption className="mt-2 text-[14px] text-muted">An illustration of the idea, not your inventory or a photograph. The words you write are the offer.</figcaption>
    </figure>
  );
}

const line = { stroke: "var(--line)", strokeWidth: 1.5, fill: "none" } as const;
const solid = { stroke: "var(--field-line)", strokeWidth: 1.5, fill: "none" } as const;

/** The sponsor's place: an accent box with the word in it. */
function Spot({ x, y, w, h, label = "Sponsor" }: { x: number; y: number; w: number; h: number; label?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--accent)" fillOpacity="0.22" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill="var(--accent-ink)" fontFamily="var(--font-sans)" letterSpacing="1">
        {label.toUpperCase()}
      </text>
    </g>
  );
}

/** A plain frame: the fallback for a section nobody has drawn yet. */
function Frame() {
  return (
    <>
      <rect x="24" y="20" width="272" height="120" {...line} />
      <line x1="24" y1="112" x2="296" y2="112" {...line} />
      <Spot x={110} y={50} w={100} h={34} />
    </>
  );
}

/** A stage seen from the room: risers, a drum, the sponsor on the front of it. */
function Stage() {
  return (
    <>
      <rect x="30" y="100" width="260" height="40" {...solid} />
      <line x1="30" y1="100" x2="60" y2="70" {...line} />
      <line x1="290" y1="100" x2="260" y2="70" {...line} />
      <line x1="60" y1="70" x2="260" y2="70" {...line} />
      <circle cx="160" cy="72" r="26" {...solid} />
      <rect x="215" y="40" width="34" height="46" {...line} />
      <rect x="72" y="40" width="34" height="46" {...line} />
      <Spot x={132} y={60} w={56} h={24} />
    </>
  );
}

/** A room: a wall, a counter, a card on it. */
function Room() {
  return (
    <>
      <line x1="20" y1="30" x2="300" y2="30" {...line} />
      <line x1="20" y1="30" x2="20" y2="140" {...line} />
      <line x1="300" y1="30" x2="300" y2="140" {...line} />
      <rect x="60" y="92" width="200" height="14" {...solid} />
      <line x1="70" y1="106" x2="70" y2="140" {...line} />
      <line x1="250" y1="106" x2="250" y2="140" {...line} />
      <Spot x={120} y={62} w={80} h={28} />
    </>
  );
}

/** A jersey, front on. */
function Jersey() {
  return (
    <>
      <path d="M110 30 L140 20 Q160 34 180 20 L210 30 L236 58 L212 72 L206 60 L206 140 L114 140 L114 60 L108 72 L84 58 Z" {...solid} />
      <Spot x={132} y={74} w={56} h={30} />
    </>
  );
}

/** A ground: a pitch line, a crowd rail, a banner on it. */
function Ground() {
  return (
    <>
      <rect x="20" y="96" width="280" height="44" {...line} />
      <line x1="160" y1="96" x2="160" y2="140" {...line} />
      <circle cx="160" cy="118" r="14" {...line} />
      <line x1="20" y1="78" x2="300" y2="78" {...solid} />
      <Spot x={96} y={44} w={128} h={26} label="Sponsor banner" />
    </>
  );
}

/** A screen with credit lines, one of them the sponsor's. */
function Screen() {
  return (
    <>
      <rect x="40" y="18" width="240" height="124" {...solid} />
      <line x1="110" y1="46" x2="210" y2="46" {...line} />
      <line x1="120" y1="62" x2="200" y2="62" {...line} />
      <line x1="100" y1="112" x2="220" y2="112" {...line} />
      <Spot x={100} y={76} w={120} h={24} label="Sponsor credit" />
    </>
  );
}

/** A phone with a post on it: an image, a caption, the sponsor named in it. */
function Post() {
  return (
    <>
      <rect x="120" y="10" width="80" height="140" rx="8" {...solid} />
      <rect x="130" y="26" width="60" height="50" {...line} />
      <line x1="130" y1="86" x2="190" y2="86" {...line} />
      <line x1="130" y1="96" x2="176" y2="96" {...line} />
      <Spot x={130} y={106} w={60} h={20} />
    </>
  );
}

/** A table: a top, legs, a card on it. */
function Table() {
  return (
    <>
      <rect x="60" y="78" width="200" height="12" {...solid} />
      <line x1="76" y1="90" x2="70" y2="140" {...line} />
      <line x1="244" y1="90" x2="250" y2="140" {...line} />
      <ellipse cx="110" cy="70" rx="18" ry="6" {...line} />
      <ellipse cx="210" cy="70" rx="18" ry="6" {...line} />
      <Spot x={136} y={40} w={48} h={28} />
    </>
  );
}

const SHAPES: Record<string, () => React.JSX.Element> = {
  onstage: Stage,
  stage: Stage,
  room: Room,
  front_of_house: Room,
  space: Room,
  field: Jersey,
  venue: Ground,
  screen: Screen,
  screening: Room,
  online: Post,
  guest_experience: Table,
  event: Table,
  community: Table,
};
