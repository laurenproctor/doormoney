import type { ReactNode } from "react";

/** Small tracked-caps label with a short rule in front: the line above every headline. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`caps inline-flex items-center gap-3.5 text-[14px] text-accent-ink ${className}`}>
      <i aria-hidden="true" className="inline-block h-px w-7 shrink-0 bg-accent" />
      <span>{children}</span>
    </span>
  );
}

const stampSizes = {
  md: "h-[132px] w-[132px] text-[14px]",
  lg: "h-[164px] w-[164px] text-[15px]",
} as const;

/** Circular seal in the page's light. Pass line breaks as separate children. */
export function Stamp({ children, size = "md", className = "" }: { children: ReactNode; size?: keyof typeof stampSizes; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`caps lit flex items-center justify-center rounded-full border border-accent/70 text-center leading-[1.45] tracking-[0.1em] text-accent-ink ${stampSizes[size]} ${className}`}
    >
      <span>{children}</span>
    </div>
  );
}

/** Section eyebrow + heading pair used on every page. */
export function SectionHead({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <>
      <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
      <h2 className="heading mb-4 max-w-[22ch] text-[clamp(30px,4.4vw,52px)] leading-[1.02]">{children}</h2>
    </>
  );
}

/** Wrapper that gives every section the same width and rule. */
export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`border-t border-line py-[84px] ${className}`}>
      <div className="mx-auto max-w-[1120px] px-7">{children}</div>
    </section>
  );
}

/** Numbered steps with thin rules between them. `lg` is the roomier version on List an act. */
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
          className={`grid border-t border-line ${ruleFirst ? "" : "first:border-t-0"} ${
            lg ? "grid-cols-[64px_1fr] gap-[18px] py-6" : "grid-cols-[52px_1fr] gap-4 py-5"
          }`}
        >
          <div className={`heading text-accent-ink ${lg ? "text-[34px]" : "text-[28px]"} leading-none`}>{String(i + 1).padStart(2, "0")}</div>
          <div>
            <b className={`block font-medium ${lg ? "text-[17px]" : "text-[16px]"}`}>{title}</b>
            <p className={`max-w-none text-muted ${lg ? "text-[15px] leading-[1.65]" : "text-[15px] leading-[1.6]"}`}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Short lines behind an accent rule: the "how it goes" lists. `marked` puts a small accent square before each line. */
export function Lines({ lines, marked = false, className = "" }: { lines: ReactNode[]; marked?: boolean; className?: string }) {
  return (
    <ul className={`max-w-[56ch] border-l border-accent/60 pl-5 text-[15px] leading-[1.6] ${marked ? "grid gap-2.5" : "grid gap-2"} ${className}`}>
      {lines.map((line, i) => (
        <li key={i} className={marked ? "grid grid-cols-[14px_1fr] items-baseline gap-2.5" : ""}>
          {marked && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-accent" />}
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
