"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RowMenuButton } from "@/components/desk";

/**
 * The rest of what a table row can do, behind the kebab in its last column.
 *
 * The kebab itself is the register's own control (`RowMenuButton`); opening it belongs to the
 * page, which is why this lives here rather than beside the primitives. Every item is an address,
 * so nothing in the menu depends on this component still being mounted once it is pressed, and a
 * destination that does not exist for this row is simply not passed in.
 *
 * Positioned against the viewport rather than against the row, because a table wide enough to
 * need a kebab is a table that scrolls sideways inside its own frame, and a panel positioned
 * inside that frame is clipped by it. It closes on Escape, on a press anywhere else, and on a
 * scroll, which is the moment its position would otherwise go stale.
 */
export type RowMenuItem = { label: string; href: string };

/** One item's height plus the panel's own padding, for deciding which way the menu opens. */
const ITEM_HEIGHT = 37;
const PANEL_PADDING = 10;

export function RowMenu({ label, items }: { label: string; items: readonly RowMenuItem[] }) {
  const [at, setAt] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = at !== null;

  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  if (items.length === 0) return null;

  return (
    <>
      <RowMenuButton
        ref={button}
        label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          if (open) return close();
          const box = (button.current ?? e.currentTarget).getBoundingClientRect();
          const right = Math.max(8, window.innerWidth - box.right);
          // The last row of a long table is near the foot of the window, so the menu opens
          // upwards when there is no room under it rather than off the bottom of the screen.
          const height = items.length * ITEM_HEIGHT + PANEL_PADDING;
          setAt(
            box.bottom + 4 + height <= window.innerHeight
              ? { top: box.bottom + 4, right }
              : { bottom: Math.max(8, window.innerHeight - box.top + 4), right },
          );
        }}
      />
      {at && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={label}
          style={{ top: at.top, bottom: at.bottom, right: at.right }}
          className="fixed z-50 min-w-[168px] rounded-card border border-line bg-surface py-1 text-left shadow-1"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              onClick={close}
              className="block px-3.5 py-2 text-[14px] text-ink no-underline hover:bg-neutral-wash"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
