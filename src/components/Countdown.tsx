"use client";
import { useEffect, useState } from "react";

function render(closesAt: string, now: number) {
  const diff = Math.floor((new Date(closesAt).getTime() - now) / 1000);
  if (diff <= 0) return "Closed";
  let s = diff;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d}d ${p(h)}:${p(m)}:${p(sec)}`;
}

/** "4d 07:12:33", ticking once a second. Server renders its own clock; the browser corrects it on mount. */
export function Countdown({ closesAt, className = "" }: { closesAt: string; className?: string }) {
  const [text, setText] = useState(() => render(closesAt, Date.now()));
  useEffect(() => {
    const tick = () => setText(render(closesAt, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
