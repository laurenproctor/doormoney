import type { ReactNode } from "react";

/**
 * One thing waiting on somebody, and the controls that finish it where it stands.
 *
 * `lead` is whatever identifies the thing at a glance: the materials a sponsor sent, a photograph,
 * or a date. It is a slot rather than a union, because what leads a row is the page's business and
 * a workspace that only knew how to draw a logo would be music's workspace.
 */
export function TaskRow({
  lead,
  title,
  detail,
  actions,
  className = "",
}: {
  lead?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line py-3 ${className}`}>
      {lead && <div className="flex-none">{lead}</div>}
      {/* The row's own text never squeezes below 15rem: on a phone the controls drop to their own
          line instead, because a sentence set one word per line is not a row anybody can scan. */}
      <div className="flex min-w-[15rem] grow basis-0 flex-col gap-0.5">
        <span className="text-[14.5px] font-medium text-ink">{title}</span>
        {detail && <span className="text-[14px] text-muted">{detail}</span>}
      </div>
      {actions && <div className="flex flex-none gap-1.5 max-sm:ml-auto">{actions}</div>}
    </div>
  );
}

/** A date as a lead: the day large, the month under it. The same 64px block every other lead fills. */
export function TaskDate({ day, month }: { day: string; month: string }) {
  return (
    <span className="flex w-16 flex-col items-center text-[14px] leading-tight text-muted">
      <span className="heading text-[18px] text-ink">{day}</span>
      {month}
    </span>
  );
}
