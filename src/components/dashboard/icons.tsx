import type { SVGProps } from "react";

/*
  The workspace's interface glyphs, drawn here rather than installed.

  The first version of this dashboard took @carbon/icons-react for these. That package runs
  `ibmtelemetry` from a postinstall hook, so every `npm ci` on a laptop and every CI run would have
  reported the install to a third party, for twenty-one glyphs the repository can draw itself. The
  marketing pages already carry one inline SVG wordmark and no icon dependency.

  All of them are 24 by 24, stroked in the current text colour at 1.5px, which is the same thin
  line the rest of the design system uses. Two are exceptions and say so. `size` sets both
  dimensions, as the old package's prop did, so the call sites read the same.
*/

type Props = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number };

function Icon({ size = 16, children, ...rest }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Something went wrong and the reader needs to know before they read on. */
export function Warning(p: Props) {
  return (
    <Icon {...p}>
      <path d="M12 3.6 22 20.4H2Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.6h.01" />
    </Icon>
  );
}

/** Done, on a preparation line that has nothing left outstanding. */
export function Checkmark(p: Props) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.4 2.6 2.6 5-5.4" />
    </Icon>
  );
}

export function ArrowRight(p: Props) {
  return (
    <Icon {...p}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function ChevronDown(p: Props) {
  return (
    <Icon {...p}>
      <path d="m6 9.5 6 6 6-6" />
    </Icon>
  );
}

/** Opens somewhere else: a public page, a new tab. */
export function Launch(p: Props) {
  return (
    <Icon {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 12 12" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

export function Search(p: Props) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.6-4.6" />
    </Icon>
  );
}

export function Add(p: Props) {
  return (
    <Icon {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

export function Location(p: Props) {
  return (
    <Icon {...p}>
      <path d="M12 21c4.6-4.4 7-7.6 7-10.4a7 7 0 1 0-14 0C5 13.4 7.4 16.6 12 21Z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </Icon>
  );
}

export function Time(p: Props) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.4 2" />
    </Icon>
  );
}

export function Copy(p: Props) {
  return (
    <Icon {...p}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" />
    </Icon>
  );
}

export function Close(p: Props) {
  return (
    <Icon {...p}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  );
}

export function Menu(p: Props) {
  return (
    <Icon {...p}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Icon>
  );
}

export function Logout(p: Props) {
  return (
    <Icon {...p}>
      <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
      <path d="M3 12h9" />
      <path d="m9 8 4 4-4 4" />
    </Icon>
  );
}

/** Fold the navigation rail to its icons: a panel with the chevron pointing into it. */
export function SidePanelClose(p: Props) {
  return (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16" />
      <path d="m16 9-3 3 3 3" />
    </Icon>
  );
}

/** Open the navigation rail back out: the same panel, chevron pointing away. */
export function SidePanelOpen(p: Props) {
  return (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16" />
      <path d="m13 9 3 3-3 3" />
    </Icon>
  );
}

/** The overview: everything at once. */
export function Dashboard(p: Props) {
  return (
    <Icon {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </Icon>
  );
}

/** A fundraiser, which for a musician is time on a stage. */
export function Microphone(p: Props) {
  return (
    <Icon {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </Icon>
  );
}

/** Money on its way out to a musician. */
export function Money(p: Props) {
  return (
    <Icon {...p}>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 12h.01" />
      <path d="M17.5 12h.01" />
    </Icon>
  );
}

/** The one line a musician pastes into their own site. */
export function Code(p: Props) {
  return (
    <Icon {...p}>
      <path d="m9 8-5 4 5 4" />
      <path d="m15 8 5 4-5 4" />
    </Icon>
  );
}

/** What this account has put behind somebody else. */
export function Favorite(p: Props) {
  return (
    <Icon {...p}>
      <path d="M12 20.2C6.6 15.4 3.5 12.6 3.5 9.2A4.2 4.2 0 0 1 7.8 5c1.6 0 3.2.8 4.2 2.2C13 5.8 14.6 5 16.2 5a4.2 4.2 0 0 1 4.3 4.2c0 3.4-3.1 6.2-8.5 11Z" />
    </Icon>
  );
}

export function UserProfile(p: Props) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="8.2" r="3.9" />
      <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
    </Icon>
  );
}

/** The account itself: the settings behind everything else. */
export function Settings(p: Props) {
  return (
    <Icon {...p}>
      <path d="M4 8h9" />
      <path d="M18.5 8H20" />
      <path d="M4 16h3.5" />
      <path d="M13 16h7" />
      <circle cx="15.8" cy="8" r="2.4" />
      <circle cx="10.2" cy="16" r="2.4" />
    </Icon>
  );
}

/** Where a patron's own history lives. */
export function Wallet(p: Props) {
  return (
    <Icon {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
      <path d="M16.5 15h1.6" />
    </Icon>
  );
}

/** A business, a team, a group: whoever is behind a fundraiser that is not one person. */
export function Organization(p: Props) {
  return (
    <Icon {...p}>
      <path d="M4 20V5.4a.9.9 0 0 1 .9-.9h8.2a.9.9 0 0 1 .9.9V20" />
      <path d="M14 10.5h5.1a.9.9 0 0 1 .9.9V20" />
      <path d="M2.5 20h19" />
      <path d="M7 8.5h1.4M10.6 8.5H12M7 12.5h1.4M10.6 12.5H12M7 16.5h1.4M10.6 16.5H12M16.8 14h1.2M16.8 17.2h1.2" />
    </Icon>
  );
}

/** Private, and staying that way until somebody publishes something. */
export function Locked(p: Props) {
  return (
    <Icon {...p}>
      <rect x="4.6" y="10.4" width="14.8" height="9.6" rx="1.2" />
      <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
    </Icon>
  );
}

/**
 * The rest of what a row can do, folded behind one control. Filled rather than stroked, which is
 * an exception to the stroked line above: three hairline circles at this size read as three smudges.
 */
export function Overflow({ size = 16, ...rest }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
