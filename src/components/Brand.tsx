import type { ReactNode } from "react";

/** Tilted yellow label. */
export function Tape({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block -rotate-[1.5deg] bg-tape px-[18px] py-1.5 text-[13px] font-bold tracking-[0.04em] text-ink shadow-[2px_2px_0_rgba(0,0,0,0.25)] ${className}`}
    >
      {children}
    </span>
  );
}

const stampSizes = {
  md: "h-[118px] w-[118px] text-[14px]",
  lg: "h-[150px] w-[150px] text-[17px]",
} as const;

/** Circular red stamp. Pass line breaks as separate children. */
export function Stamp({ children, size = "md", className = "" }: { children: ReactNode; size?: keyof typeof stampSizes; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`typewriter flex -rotate-[8deg] items-center justify-center rounded-full border-[3px] border-red text-center leading-[1.25] text-red ${stampSizes[size]} ${className}`}
    >
      {children}
    </div>
  );
}

/** Section eyebrow + heading pair used on every page. */
export function SectionHead({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <>
      <h3 className="typewriter mb-3 text-[15px] text-red">{eyebrow}</h3>
      <h2 className="poster mb-4 text-[clamp(32px,4.8vw,54px)] leading-none">{children}</h2>
    </>
  );
}

/** Wrapper that gives every section the same width and rule. */
export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`border-t-[3px] border-ink py-[84px] ${className}`}>
      <div className="mx-auto max-w-[1020px] px-7">{children}</div>
    </section>
  );
}

/** Numbered steps with dashed rules between them. `lg` is the roomier version on List an act. */
export function Steps({
  steps,
  size = "md",
  ruleFirst = true,
  className = "",
}: {
  steps: [string, string][];
  size?: "md" | "lg";
  ruleFirst?: boolean;
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <div className={className}>
      {steps.map(([title, body], i) => (
        <div
          key={title}
          className={`grid border-t-2 border-dashed border-gray ${ruleFirst ? "" : "first:border-t-0"} ${
            lg ? "grid-cols-[52px_1fr] gap-[18px] py-5" : "grid-cols-[44px_1fr] gap-4 py-4"
          }`}
        >
          <div className={`poster text-red ${lg ? "text-[30px]" : "text-[26px]"}`}>{i + 1}</div>
          <div>
            <b className={`block ${lg ? "text-[17px]" : "text-[16px]"}`}>{title}</b>
            <p className={`max-w-none text-gray ${lg ? "text-[15px] leading-[1.65]" : "text-[14.5px] leading-[1.6]"}`}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Typewriter lines behind a black rule: the "how it goes" lists. `marked` puts a red x before each line. */
export function Lines({ lines, marked = false, className = "" }: { lines: ReactNode[]; marked?: boolean; className?: string }) {
  return (
    <ul className={`typewriter max-w-[56ch] border-l-[3px] border-ink text-[15px] ${marked ? "pl-5 leading-[2.2]" : "pl-[18px] leading-[2]"} ${className}`}>
      {lines.map((line, i) => (
        <li key={i}>
          {marked && <span className="text-red">x </span>}
          {line}
        </li>
      ))}
    </ul>
  );
}
