"use client";
import { useEffect } from "react";

/*
  Reveals blocks as they scroll into view. Anything with a `data-reveal` attribute starts a little
  low and transparent (see globals.css) and gets `data-in` the first time it enters the viewport,
  which lets the CSS transition carry it up into place. A `--i` custom property on the element
  staggers siblings. Marks <html> with data-js so the hidden starting state only ever applies when
  this script is running: without JavaScript every block is simply visible.
*/
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.js = "1";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => (el.dataset.in = "1"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "1";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const watch = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>("[data-reveal]:not([data-in])").forEach((el) => io.observe(el));
    };
    watch(document);

    // Content that arrives later (navigation, live updates) gets the same treatment.
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) {
            if (n.matches("[data-reveal]") && !n.dataset.in) io.observe(n);
            watch(n);
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
