import type { ReactNode } from "react";

/**
 * A block of the workspace: a lifted surface, one hairline around it, an 8px corner and a shadow
 * that is a hint rather than a hole. No glow and no tilt. The Stage register's `glow` says "look
 * at this"; a workspace made of them would say it nine times on one screen.
 *
 * `right` is the slot on the head's far side: a count, a link, or one small control.
 */
export function Card({
  title,
  subtitle,
  right,
  id,
  className = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const head = title || subtitle || right;
  return (
    <section id={id} className={`flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-1 ${className}`}>
      {head && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="heading text-[16px] text-ink">{title}</h2>}
            {subtitle && <span className="text-[14px] text-muted">{subtitle}</span>}
          </div>
          {right && <div className="flex flex-none items-center gap-2 text-[14px]">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
