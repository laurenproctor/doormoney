"use client";
import { useEffect, useRef } from "react";

/*
  Stage lights. Three lamps on a truss above the page throw cones of the page's accent down the room,
  and a pool of light lies on the floor. As the reader scrolls, the lamps swing and the pool drifts,
  eased so the movement feels like a rig being steered rather than a page being dragged. On top of
  that each lamp sways on its own, its lens breathes, and the beam flickers faintly, so the rig is
  never quite still even when the page is.

  The layer is fixed behind the content (Theme gives it a stacking context) and never takes clicks.
  Scroll progress goes in as a CSS variable, --p, from 0 at the top of a page to 1 at the bottom;
  the CSS in globals.css turns that into the angle of each beam. Readers who ask for reduced motion
  get the lights held still at their mid-scroll position.
*/
export function StageLights() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--p", "0.5");
      return;
    }

    let target = 0;
    let current = -1;
    let frame = 0;

    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    const tick = () => {
      frame = 0;
      if (current < 0) current = target;
      const diff = target - current;
      if (Math.abs(diff) < 0.0005) {
        current = target;
      } else {
        current += diff * 0.08;
        frame = requestAnimationFrame(tick);
      }
      el.style.setProperty("--p", current.toFixed(4));
    };

    const onScroll = () => {
      target = progress();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="stage-lights">
      {[1, 2, 3].map((n) => (
        <div key={n} className={`lamp lamp-${n}`}>
          <div className="swing">
            <span className="lens" />
            <span className="beam" />
          </div>
        </div>
      ))}
      <div className="pool" />
      <div className="haze" />
    </div>
  );
}
