import type { ReactNode } from "react";
/**
 * Schematic line drawings from docs/mockups/placements.html, verbatim.
 * Red marks the sold surface. Keyed by the surface key in src/lib/catalog.ts.
 */

const shared = { fill: "none", stroke: "#000", strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/** Head-on view of a stage with the five onstage placements numbered. */
export function StageSchematic() {
  return (
    <svg
      viewBox="0 0 900 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Head-on view of a stage with the five onstage placements marked"
      className="block h-auto w-full"
      {...shared}
    >
      <line x1="20" y1="352" x2="880" y2="352"/>
      <line x1="20" y1="374" x2="880" y2="374" stroke="#8A8378" strokeWidth="2"/>
      <rect x="40" y="268" width="106" height="42"/>
      <rect x="40" y="310" width="106" height="42"/>
      <rect x="62" y="278" width="52" height="24" fill="#E03A1E" stroke="#E03A1E"/>
      <rect x="182" y="256" width="96" height="96"/>
      <rect x="194" y="268" width="72" height="72" stroke="#8A8378" strokeWidth="2"/>
      <rect x="194" y="292" width="72" height="26" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="330" cy="188" r="20"/>
      <path d="M302 220 q28 -12 56 0 l10 132 h-76 z"/>
      <path d="M304 218 L364 282" stroke="#E03A1E" strokeWidth="12"/>
      <ellipse cx="348" cy="280" rx="32" ry="23"/>
      <line x1="372" y1="266" x2="418" y2="228"/>
      <path d="M436 250 h112 l22 44 H414 z"/>
      <rect x="414" y="294" width="156" height="24" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="492" cy="216" r="34"/>
      <circle cx="492" cy="216" r="21" fill="#E03A1E" stroke="#E03A1E"/>
      <rect x="446" y="184" width="22" height="18"/>
      <rect x="516" y="184" width="22" height="18"/>
      <line x1="410" y1="176" x2="444" y2="168"/>
      <line x1="427" y1="172" x2="427" y2="250"/>
      <circle cx="628" cy="188" r="20"/>
      <path d="M600 220 q28 -12 56 0 l10 132 h-76 z"/>
      <path d="M602 218 L662 282" stroke="#E03A1E" strokeWidth="12"/>
      <ellipse cx="646" cy="280" rx="32" ry="23"/>
      <line x1="670" y1="266" x2="716" y2="228"/>
      <rect x="722" y="256" width="96" height="96"/>
      <rect x="734" y="268" width="72" height="72" stroke="#8A8378" strokeWidth="2"/>
      <rect x="734" y="292" width="72" height="26" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="492" cy="150" r="13" fill="#E03A1E" stroke="#E03A1E"/>
      <text x="492" y="156" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Archivo,Helvetica,sans-serif" fontSize="16" fontWeight="700">1</text>
      <circle cx="93" cy="236" r="13" fill="#E03A1E" stroke="#E03A1E"/>
      <text x="93" y="242" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Archivo,Helvetica,sans-serif" fontSize="16" fontWeight="700">2</text>
      <circle cx="300" cy="176" r="13" fill="#E03A1E" stroke="#E03A1E"/>
      <text x="300" y="182" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Archivo,Helvetica,sans-serif" fontSize="16" fontWeight="700">3</text>
      <circle cx="230" cy="224" r="13" fill="#E03A1E" stroke="#E03A1E"/>
      <text x="230" y="230" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Archivo,Helvetica,sans-serif" fontSize="16" fontWeight="700">4</text>
      <circle cx="492" cy="336" r="13" fill="#E03A1E" stroke="#E03A1E"/>
      <text x="492" y="342" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Archivo,Helvetica,sans-serif" fontSize="16" fontWeight="700">5</text>
    </svg>
  );
}

/** Small per-surface diagram. Decorative: the card text next to it says what it shows. */
function Diagram({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="block h-auto w-full" {...shared}>
      {children}
    </svg>
  );
}

export const DIAGRAMS: Record<string, ReactNode> = {
  kick_head: (
    <Diagram>
      <line x1="20" y1="132" x2="180" y2="132"/>
      <circle cx="100" cy="88" r="42"/>
      <circle cx="100" cy="88" r="26" fill="#E03A1E" stroke="#E03A1E"/>
      <rect x="52" y="46" width="26" height="22" rx="2"/>
      <rect x="122" y="46" width="26" height="22" rx="2"/>
      <line x1="30" y1="42" x2="66" y2="34"/>
      <line x1="48" y1="38" x2="48" y2="132"/>
      <line x1="134" y1="34" x2="170" y2="42"/>
      <line x1="152" y1="38" x2="152" y2="132"/>
    </Diagram>
  ),
  case_sticker: (
    <Diagram>
      <rect x="52" y="86" width="96" height="42"/>
      <rect x="52" y="48" width="96" height="38"/>
      <rect x="52" y="22" width="96" height="26"/>
      <rect x="70" y="56" width="46" height="22" fill="#E03A1E" stroke="#E03A1E"/>
      <line x1="62" y1="86" x2="62" y2="128"/>
      <line x1="138" y1="86" x2="138" y2="128"/>
      <circle cx="70" cy="120" r="5"/>
      <circle cx="130" cy="120" r="5"/>
    </Diagram>
  ),
  strap: (
    <Diagram>
      <circle cx="100" cy="34" r="18"/>
      <path d="M74 62 q26 -10 52 0 l8 66 h-68 z"/>
      <path d="M76 60 L134 116" stroke="#E03A1E" strokeWidth="11"/>
      <ellipse cx="118" cy="112" rx="30" ry="22"/>
      <line x1="140" y1="98" x2="182" y2="62"/>
    </Diagram>
  ),
  amp_grille: (
    <Diagram>
      <rect x="18" y="46" width="76" height="76"/>
      <rect x="106" y="46" width="76" height="76"/>
      <rect x="28" y="56" width="56" height="56" stroke="#8A8378" strokeWidth="2"/>
      <rect x="116" y="56" width="56" height="56" stroke="#8A8378" strokeWidth="2"/>
      <rect x="28" y="72" width="56" height="24" fill="#E03A1E" stroke="#E03A1E"/>
      <rect x="116" y="72" width="56" height="24" fill="#E03A1E" stroke="#E03A1E"/>
    </Diagram>
  ),
  riser_fascia: (
    <Diagram>
      <line x1="10" y1="134" x2="190" y2="134"/>
      <path d="M46 76 h108 l18 30 H28 z"/>
      <rect x="28" y="106" width="144" height="20" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="100" cy="54" r="22"/>
      <rect x="60" y="36" width="18" height="16"/>
      <rect x="122" y="36" width="18" height="16"/>
    </Diagram>
  ),
  tip_jar_card: (
    <Diagram>
      <path d="M66 48 h68 l-8 82 h-52 z"/>
      <line x1="62" y1="48" x2="138" y2="48"/>
      <rect x="72" y="72" width="56" height="38" fill="#E03A1E" stroke="#E03A1E"/>
      <path d="M88 34 q12 -12 24 0" stroke="#8A8378" strokeWidth="2"/>
      <line x1="26" y1="130" x2="174" y2="130"/>
    </Diagram>
  ),
  stage_thanks: (
    <Diagram>
      <rect x="84" y="24" width="32" height="52" rx="16"/>
      <line x1="100" y1="76" x2="100" y2="128"/>
      <line x1="72" y1="128" x2="128" y2="128"/>
      <path d="M136 36 q22 34 0 68" stroke="#E03A1E"/>
      <path d="M156 22 q32 46 0 96" stroke="#E03A1E"/>
      <path d="M64 36 q-22 34 0 68" stroke="#E03A1E"/>
    </Diagram>
  ),
  merch_runner: (
    <Diagram>
      <line x1="18" y1="70" x2="182" y2="70"/>
      <line x1="30" y1="70" x2="30" y2="132"/>
      <line x1="170" y1="70" x2="170" y2="132"/>
      <rect x="18" y="70" width="164" height="22" fill="#E03A1E" stroke="#E03A1E"/>
      <rect x="44" y="44" width="34" height="26"/>
      <rect x="88" y="44" width="34" height="26"/>
      <path d="M136 44 h30 v26 h-30 z"/>
      <line x1="136" y1="54" x2="166" y2="54" stroke="#8A8378" strokeWidth="2"/>
    </Diagram>
  ),
  hang_tags: (
    <Diagram>
      <path d="M62 40 l14 -14 h48 l14 14 -18 14 v70 H80 V54 z"/>
      <path d="M124 44 q18 6 20 24" stroke="#8A8378" strokeWidth="2"/>
      <path d="M136 68 h34 v30 h-34 l-10 -15 z" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="140" cy="83" r="3" fill="#fff" stroke="#fff"/>
    </Diagram>
  ),
  picks: (
    <Diagram>
      <path d="M34 44 h44 q6 30 -22 60 q-28 -30 -22 -60 z"/>
      <path d="M96 44 h44 q6 30 -22 60 q-28 -30 -22 -60 z" fill="#E03A1E" stroke="#E03A1E"/>
      <path d="M66 92 h44 q6 30 -22 60 q-28 -30 -22 -60 z" stroke="#8A8378" strokeWidth="2"/>
    </Diagram>
  ),
  poster_credit: (
    <Diagram>
      <rect x="44" y="16" width="112" height="120"/>
      <line x1="58" y1="42" x2="142" y2="42" strokeWidth="10"/>
      <line x1="58" y1="60" x2="122" y2="60" strokeWidth="10"/>
      <line x1="58" y1="82" x2="142" y2="82" stroke="#8A8378" strokeWidth="3"/>
      <line x1="58" y1="94" x2="132" y2="94" stroke="#8A8378" strokeWidth="3"/>
      <rect x="58" y="108" width="84" height="16" fill="#E03A1E" stroke="#E03A1E"/>
    </Diagram>
  ),
  posts_email: (
    <Diagram>
      <rect x="58" y="12" width="84" height="126" rx="8"/>
      <rect x="68" y="34" width="64" height="46" stroke="#8A8378" strokeWidth="2"/>
      <line x1="68" y1="94" x2="132" y2="94" stroke="#8A8378" strokeWidth="3"/>
      <rect x="68" y="104" width="64" height="14" fill="#E03A1E" stroke="#E03A1E"/>
      <line x1="86" y1="22" x2="114" y2="22" strokeWidth="4"/>
    </Diagram>
  ),
  vlog_card: (
    <Diagram>
      <rect x="20" y="30" width="160" height="94"/>
      <path d="M88 60 l30 17 -30 17 z" stroke="#8A8378" strokeWidth="3"/>
      <rect x="32" y="96" width="46" height="18" fill="#E03A1E" stroke="#E03A1E"/>
      <line x1="20" y1="30" x2="180" y2="30" strokeWidth="6"/>
    </Diagram>
  ),
  rig_rundown: (
    <Diagram>
      <rect x="20" y="48" width="160" height="72" rx="4"/>
      <rect x="34" y="62" width="38" height="44"/>
      <rect x="82" y="62" width="38" height="44"/>
      <rect x="130" y="62" width="38" height="44" fill="#E03A1E" stroke="#E03A1E"/>
      <circle cx="53" cy="74" r="5"/>
      <circle cx="101" cy="74" r="5"/>
      <circle cx="149" cy="74" r="5" fill="#fff" stroke="#fff"/>
    </Diagram>
  ),
};
